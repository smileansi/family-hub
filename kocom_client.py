from __future__ import annotations

import hashlib
import re
import socket
import struct
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime

DISCOVERY_URL = "http://221.141.3.28/SvrInfo.php?uid="
HEADER_KEY = 0x12345678
SMART_USER_TYPE = 0x01100000
KIND_MAP = {
    1: "electricity",
    2: "water",
    3: "hot_water",
    4: "gas",
    5: "heating",
}


class KocomError(RuntimeError):
    pass


@dataclass
class Packet:
    message_type: int
    town: int
    dong: int
    ho: int
    reserved: int
    body: bytes

    @property
    def subtype(self) -> int:
        return self.message_type & 0xFFFF


def _fixed(value: str, size: int, encoding: str = "utf-8") -> bytes:
    encoded = value.encode(encoding)[:size]
    return encoded + bytes(size - len(encoded))


def discover_server(user_id: str, timeout: float = 8.0) -> str:
    url = DISCOVERY_URL + urllib.parse.quote(user_id)
    request = urllib.request.Request(url, headers={"User-Agent": "Kocom HomeManager"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        text = response.read().decode("utf-8", errors="replace")
    if "error:" in text.lower():
        raise KocomError(text.strip())

    fields: dict[int, str] = {}
    for number, value in re.findall(r"(\d+)\s*=>\s*([^<\r\n]+)", text):
        fields[int(number)] = value.strip()
    if fields.get(0) != "[OK]" or not fields.get(3):
        raise KocomError("단지 서버 주소를 확인하지 못했습니다.")
    return fields[3]


class KocomClient:
    def __init__(self, user_id: str, password: str, phone: str, timeout: float = 10):
        self.user_id = user_id
        self.password = password
        self.phone = phone
        self.timeout = timeout
        self.sock: socket.socket | None = None
        self.town = self.dong = self.ho = self.reserved = 0

    def __enter__(self) -> "KocomClient":
        server = discover_server(self.user_id, self.timeout)
        self.sock = socket.create_connection((server, 15000), timeout=self.timeout)
        self.sock.settimeout(self.timeout)
        self._send(0, self._bind_body())
        self._wait_for({1, 3001})
        return self

    def __exit__(self, *_args) -> None:
        if self.sock:
            self.sock.close()
            self.sock = None

    def _bind_body(self) -> bytes:
        body = bytearray(380)
        # HOME_VERSION, reserved, WALL_PAD_VERSION는 원본 앱 기본값인 0이다.
        body[24:64] = _fixed(hashlib.md5(self.user_id.encode()).hexdigest(), 40)
        body[64:104] = _fixed(hashlib.md5(self.password.encode()).hexdigest(), 40)
        struct.pack_into("<I", body, 104, 1)
        body[108:364] = _fixed("", 256)
        body[364:380] = _fixed(self.phone, 16)
        return bytes(body)

    def _send(self, subtype: int, body: bytes) -> None:
        if not self.sock:
            raise KocomError("서버에 연결되지 않았습니다.")
        message_type = SMART_USER_TYPE | subtype
        header = struct.pack(
            "<7I",
            HEADER_KEY,
            message_type,
            len(body),
            self.town,
            self.dong,
            self.ho,
            self.reserved,
        )
        self.sock.sendall(header + body)

    def _read_exact(self, size: int) -> bytes:
        if not self.sock:
            raise KocomError("서버에 연결되지 않았습니다.")
        chunks = bytearray()
        while len(chunks) < size:
            chunk = self.sock.recv(size - len(chunks))
            if not chunk:
                raise KocomError("코콤 서버 연결이 종료됐습니다.")
            chunks.extend(chunk)
        return bytes(chunks)

    def _receive(self) -> Packet:
        key = struct.unpack("<I", self._read_exact(4))[0]
        if key != HEADER_KEY:
            raise KocomError("알 수 없는 코콤 응답 헤더입니다.")
        message_type, size, town, dong, ho, reserved = struct.unpack(
            "<6I", self._read_exact(24)
        )
        self.town = self.town or town
        self.dong = self.dong or dong
        self.ho = self.ho or ho
        self.reserved = reserved
        return Packet(
            message_type, town, dong, ho, reserved, self._read_exact(size)
        )

    def _wait_for(self, expected: set[int]) -> Packet:
        # bind ACK 뒤 INIT ACK가 별도로 도착하는 현장을 모두 수용한다.
        last: Packet | None = None
        for _ in range(8):
            packet = self._receive()
            last = packet
            if packet.subtype == 1:
                result = struct.unpack_from("<i", packet.body, 0)[0]
                if result not in (0, 4):
                    raise KocomError(f"코콤 로그인 실패 코드: {result}")
                if 1 in expected:
                    return packet
            if packet.subtype in expected:
                return packet
        raise KocomError(f"예상한 응답을 받지 못했습니다: {last}")

    def fetch_current_totals(self) -> dict[str, float]:
        now = datetime.now()
        body = bytearray(72)
        struct.pack_into("<III", body, 0, 2, 2, 1)
        period = f"{now.year:04d}-{now.month:02d}-00 00:00:00"
        body[12:32] = _fixed(period, 20)
        body[32:52] = _fixed(period, 20)
        body[52:72] = _fixed("1,2,3,4,5", 20)
        self._send(400, bytes(body))
        response = self._wait_for({401, 419, 10000})
        if response.subtype in {419, 10000}:
            code = struct.unpack_from("<i", response.body, 0)[0]
            raise KocomError(f"에너지 조회 실패 코드: {code}")
        return parse_current_totals(response.body)


def parse_current_totals(body: bytes) -> dict[str, float]:
    if len(body) < 64:
        raise KocomError("에너지 응답이 너무 짧습니다.")
    count = struct.unpack_from("<I", body, 60)[0]
    totals: dict[str, float] = {}
    for index in range(min(count, 20)):
        offset = 64 + index * 44
        if len(body) < offset + 44:
            break
        kind_id = struct.unpack_from("<I", body, offset)[0]
        kind = KIND_MAP.get(kind_id)
        if kind:
            totals[kind] = struct.unpack_from("<d", body, offset + 24)[0]
    if not totals:
        raise KocomError("에너지 항목을 응답에서 찾지 못했습니다.")
    return totals
