from datetime import date, datetime

from kocom_client import parse_current_totals
from storage import EnergyStore
from tariff import estimate_electricity_bill


def test_bill_is_progressive():
    assert estimate_electricity_bill(350)["total"] > estimate_electricity_bill(200)["total"]


def test_hourly_delta(tmp_path):
    store = EnergyStore(str(tmp_path / "energy.db"))
    store.save(datetime(2026, 7, 30, 9), {"electricity": 100}, "test")
    store.save(datetime(2026, 7, 30, 10), {"electricity": 101.25}, "test")
    assert store.hourly(date(2026, 7, 30))["electricity"][10] == 1.25


def test_parse_current_totals():
    import struct

    body = bytearray(108)
    struct.pack_into("<I", body, 60, 1)
    struct.pack_into("<I", body, 64, 1)
    struct.pack_into("<d", body, 88, 123.45)
    assert parse_current_totals(bytes(body))["electricity"] == 123.45
