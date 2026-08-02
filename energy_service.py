from __future__ import annotations

import math
import os
import threading
from calendar import monthrange
from datetime import date, datetime, timedelta
from pathlib import Path

from dotenv import load_dotenv

from kocom_client import KocomClient, KocomError
from storage import EnergyStore
from tariff import estimate_electricity_bill

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / ".env")

store = EnergyStore(str(ROOT / os.getenv("KOCOM_DB_PATH", "family_hub.db")))

FOUR_PERSON_SEASONAL_BENCHMARKS = {
    1: ("겨울", 380.0),
    2: ("겨울", 380.0),
    3: ("봄", 280.0),
    4: ("봄", 280.0),
    5: ("봄", 280.0),
    6: ("초여름", 340.0),
    7: ("여름", 470.0),
    8: ("여름", 470.0),
    9: ("가을", 270.0),
    10: ("가을", 270.0),
    11: ("가을", 270.0),
    12: ("겨울", 380.0),
}
for legacy_database in (
    ROOT / "data" / "energy-v3.db",
    ROOT / "data" / "energy.db",
):
    store.import_database(legacy_database)
_sync_lock = threading.Lock()
_collector_lock = threading.Lock()
_collector_started = False
_lease_path = ROOT / "data" / ".energy-sync.lock"
status = {
    "state": "ready",
    "message": "에너지 수집을 준비했습니다.",
    "at": None,
}


def is_demo() -> bool:
    return os.getenv("KOCOM_DEMO", "true").lower() in {"1", "true", "yes"}


def demo_totals(moment: datetime) -> dict[str, float]:
    day_index = moment.day - 1
    hour = moment.hour + moment.minute / 60

    def electric_rate(value: float) -> float:
        return (
            0.22
            + 0.16 * math.exp(-((value - 7.5) / 2.0) ** 2)
            + 0.42 * math.exp(-((value - 20.5) / 3.0) ** 2)
        )

    daily_total = sum(electric_rate(value + 0.5) for value in range(24))
    full_hours = sum(electric_rate(value + 0.5) for value in range(moment.hour))
    fraction = moment.minute / 60
    cumulative = day_index * daily_total + full_hours + electric_rate(hour) * fraction
    return {
        "electricity": round(cumulative, 4),
        "gas": round(day_index * 0.22 + hour * 0.012, 4),
        "water": round(day_index * 0.48 + hour * 0.022, 4),
        "hot_water": round(day_index * 0.16 + hour * 0.008, 4),
        "heating": round(day_index * 0.12 + hour * 0.006, 4),
    }


def seed_demo(days: int = 45) -> None:
    if store.latest():
        return
    end = datetime.now().replace(minute=0, second=0, microsecond=0)
    cursor = end - timedelta(days=days)
    while cursor <= end:
        store.save(cursor, demo_totals(cursor), "demo")
        cursor += timedelta(hours=1)


def _poll_minutes() -> int:
    return max(15, int(os.getenv("KOCOM_POLL_MINUTES", "60")))


def _reading_is_fresh() -> bool:
    latest = store.latest()
    if not latest:
        return False
    measured_at = datetime.fromisoformat(latest["measured_at"])
    return datetime.now() - measured_at < timedelta(minutes=_poll_minutes() - 1)


def _acquire_process_lease() -> bool:
    _lease_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        descriptor = os.open(_lease_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        os.write(descriptor, str(os.getpid()).encode())
        os.close(descriptor)
        return True
    except FileExistsError:
        try:
            if datetime.now().timestamp() - _lease_path.stat().st_mtime > 180:
                _lease_path.unlink(missing_ok=True)
        except OSError:
            pass
        return False


def _release_process_lease() -> None:
    try:
        _lease_path.unlink(missing_ok=True)
    except OSError:
        pass


def sync_now(force: bool = False) -> dict:
    if not force and _reading_is_fresh():
        return {"ok": True, "skipped": True, "message": "최신 데이터가 있습니다."}
    if not _sync_lock.acquire(blocking=False):
        return {"ok": False, "message": "이미 동기화 중입니다."}
    if not _acquire_process_lease():
        _sync_lock.release()
        return {"ok": True, "skipped": True, "message": "다른 프로세스가 동기화 중입니다."}

    try:
        status.update(state="syncing", message="코콤 서버에서 읽는 중", at=None)
        moment = datetime.now().replace(second=0, microsecond=0)
        if is_demo():
            totals = demo_totals(moment)
            source = "demo"
        else:
            credentials = (
                os.getenv("KOCOM_USER_ID", ""),
                os.getenv("KOCOM_PASSWORD", ""),
                os.getenv("KOCOM_PHONE", ""),
            )
            if not all(credentials):
                raise KocomError(".env에 코콤 계정과 전화번호를 입력해 주세요.")
            with KocomClient(*credentials) as client:
                totals = client.fetch_current_totals()
            source = "kocom"

        store.save(moment, totals, source)
        status.update(
            state="connected" if source == "kocom" else "demo",
            message="코콤 연결됨" if source == "kocom" else "데모 모드",
            at=moment.isoformat(),
        )
        return {"ok": True, "totals": totals, "source": source}
    except Exception as exc:  # noqa: BLE001
        status.update(state="error", message=str(exc), at=datetime.now().isoformat())
        return {"ok": False, "message": str(exc)}
    finally:
        _release_process_lease()
        _sync_lock.release()


def dashboard(selected: date) -> dict:
    if is_demo():
        seed_demo()
    hourly = store.hourly(selected)
    day_kwh = round(sum(value or 0 for value in hourly["electricity"]), 3)
    month_kwh = store.month_usage(selected)
    voltage = os.getenv("ELECTRICITY_VOLTAGE", "high")
    today = date.today()
    days_in_month = monthrange(selected.year, selected.month)[1]
    is_current_month = (selected.year, selected.month) == (today.year, today.month)
    elapsed_days = max(1, min(today.day if is_current_month else days_in_month, days_in_month))
    projected_kwh = (
        round(month_kwh / elapsed_days * days_in_month, 1)
        if is_current_month
        else round(month_kwh, 1)
    )
    projected_bill = estimate_electricity_bill(projected_kwh, voltage)
    season, benchmark = FOUR_PERSON_SEASONAL_BENCHMARKS[selected.month]
    available_dates = store.available_dates()
    return {
        "date": selected.isoformat(),
        "hours": [f"{hour:02d}:00" for hour in range(24)],
        "hourly": hourly,
        "day_kwh": day_kwh,
        "month_kwh": month_kwh,
        "bill": estimate_electricity_bill(month_kwh, voltage),
        "projection": {
            "kwh": projected_kwh,
            "bill": projected_bill,
            "elapsed_days": elapsed_days,
            "days_in_month": days_in_month,
            "method": "daily_average",
        },
        "benchmark": {
            "kwh": benchmark,
            "bill": estimate_electricity_bill(benchmark, voltage)["total"],
            "difference_kwh": round(projected_kwh - benchmark, 1),
            "percent": round(projected_kwh / benchmark * 100, 1) if benchmark else 0,
            "season": season,
            "source": "전기가스 4인 가구 계절별 평균 참고값",
            "source_url": "https://junkigas.com/electricity-and-gas-prices/average-bill-by-household",
        },
        "latest": store.latest(),
        "available_dates": available_dates,
        "history": {
            "first_date": available_dates[-1] if available_dates else None,
            "last_date": available_dates[0] if available_dates else None,
            "day_count": len(available_dates),
        },
        "mode": "demo" if is_demo() else "kocom",
        "status": status,
    }


def _collector_loop() -> None:
    while True:
        sync_now()
        threading.Event().wait(60)


def ensure_collector() -> None:
    global _collector_started
    with _collector_lock:
        if _collector_started:
            return
        threading.Thread(
            target=_collector_loop,
            name="kocom-energy-collector",
            daemon=True,
        ).start()
        _collector_started = True
