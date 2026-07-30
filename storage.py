from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Iterator

KINDS = ("electricity", "gas", "water", "hot_water", "heating")


class EnergyStore:
    def __init__(self, path: str):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._init()

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA journal_mode = WAL")
        try:
            yield db
            db.commit()
        finally:
            db.close()

    def _init(self) -> None:
        with self.connect() as db:
            db.execute(
                """
                CREATE TABLE IF NOT EXISTS energy_readings (
                    measured_at TEXT NOT NULL,
                    kind TEXT NOT NULL,
                    cumulative REAL NOT NULL,
                    source TEXT NOT NULL DEFAULT 'kocom',
                    PRIMARY KEY (measured_at, kind)
                )
                """
            )
            db.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_energy_readings_kind_time
                ON energy_readings(kind, measured_at)
                """
            )

    def save(self, measured_at: datetime, totals: dict[str, float], source: str) -> None:
        stamp = measured_at.replace(microsecond=0).isoformat()
        rows = [
            (stamp, kind, float(value), source)
            for kind, value in totals.items()
            if kind in KINDS
        ]
        with self.connect() as db:
            db.executemany(
                """
                INSERT INTO energy_readings(measured_at, kind, cumulative, source)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(measured_at, kind) DO UPDATE SET
                    cumulative=excluded.cumulative,
                    source=excluded.source
                """,
                rows,
            )

    def latest(self) -> dict | None:
        with self.connect() as db:
            row = db.execute(
                "SELECT measured_at, source FROM energy_readings ORDER BY measured_at DESC LIMIT 1"
            ).fetchone()
        return dict(row) if row else None

    def hourly(self, selected: date) -> dict[str, list[float | None]]:
        start = datetime.combine(selected, datetime.min.time())
        end = start + timedelta(days=1)
        previous = start - timedelta(days=2)
        with self.connect() as db:
            rows = db.execute(
                """
                SELECT measured_at, kind, cumulative
                FROM energy_readings
                WHERE measured_at >= ? AND measured_at < ?
                ORDER BY measured_at
                """,
                (previous.isoformat(), end.isoformat()),
            ).fetchall()

        result: dict[str, list[float | None]] = {
            kind: [None] * 24 for kind in KINDS
        }
        last: dict[str, tuple[datetime, float]] = {}
        for row in rows:
            stamp = datetime.fromisoformat(row["measured_at"])
            kind = row["kind"]
            value = float(row["cumulative"])
            prior = last.get(kind)
            if start <= stamp < end and prior:
                delta = value - prior[1]
                # 월초 등 누적값 초기화 시 현재 값을 새 구간 사용량으로 본다.
                if delta < 0:
                    delta = value
                result[kind][stamp.hour] = round(max(0.0, delta), 4)
            last[kind] = (stamp, value)
        return result

    def month_usage(self, selected: date, kind: str = "electricity") -> float:
        start = datetime(selected.year, selected.month, 1)
        if selected.month == 12:
            end = datetime(selected.year + 1, 1, 1)
        else:
            end = datetime(selected.year, selected.month + 1, 1)
        with self.connect() as db:
            rows = db.execute(
                """
                SELECT cumulative FROM energy_readings
                WHERE kind=? AND measured_at>=? AND measured_at<?
                ORDER BY measured_at
                """,
                (kind, start.isoformat(), end.isoformat()),
            ).fetchall()
        if not rows:
            return 0.0
        # 코콤 월 조회 값은 해당 월의 누적 사용량이므로 최신값이 월 사용량이다.
        return round(max(0.0, float(rows[-1][0])), 3)

    def available_dates(self, kind: str = "electricity") -> list[str]:
        with self.connect() as db:
            rows = db.execute(
                """
                SELECT DISTINCT substr(measured_at, 1, 10) AS reading_date
                FROM energy_readings
                WHERE kind=?
                ORDER BY reading_date DESC
                """,
                (kind,),
            ).fetchall()
        return [row["reading_date"] for row in rows]

    def import_database(self, legacy_path: str | Path) -> int:
        legacy = Path(legacy_path)
        if not legacy.exists() or legacy.resolve() == self.path.resolve():
            return 0

        source = sqlite3.connect(legacy, timeout=10)
        source.row_factory = sqlite3.Row
        try:
            tables = {
                row["name"]
                for row in source.execute(
                    "SELECT name FROM sqlite_master WHERE type='table'"
                ).fetchall()
            }
            table = "energy_readings" if "energy_readings" in tables else "readings"
            if table not in tables:
                return 0
            rows = source.execute(
                f"SELECT measured_at, kind, cumulative, source FROM {table}"
            ).fetchall()
        finally:
            source.close()

        with self.connect() as db:
            before = db.total_changes
            db.executemany(
                """
                INSERT OR IGNORE INTO energy_readings(
                    measured_at, kind, cumulative, source
                ) VALUES (?, ?, ?, ?)
                """,
                [
                    (
                        row["measured_at"],
                        row["kind"],
                        row["cumulative"],
                        row["source"],
                    )
                    for row in rows
                ],
            )
            return db.total_changes - before
