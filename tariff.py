from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Tariff:
    basic: tuple[float, float, float]
    energy: tuple[float, float, float]
    climate_per_kwh: float = 9.0
    fuel_per_kwh: float = 5.0
    fund_rate: float = 0.037
    vat_rate: float = 0.10


# 주택용 요금은 관리 화면에서 언제든 교체할 수 있도록 한 곳에 모았다.
TARIFFS = {
    "low": Tariff((910, 1600, 7300), (120.0, 214.6, 307.3)),
    "high": Tariff((730, 1260, 6060), (105.0, 174.0, 242.3)),
}


def estimate_electricity_bill(kwh: float, voltage: str = "high") -> dict[str, float]:
    usage = max(0.0, float(kwh))
    tariff = TARIFFS.get(voltage, TARIFFS["high"])

    if usage <= 200:
        basic = tariff.basic[0]
    elif usage <= 400:
        basic = tariff.basic[1]
    else:
        basic = tariff.basic[2]

    first = min(usage, 200)
    second = min(max(usage - 200, 0), 200)
    third = max(usage - 400, 0)
    energy_charge = (
        first * tariff.energy[0]
        + second * tariff.energy[1]
        + third * tariff.energy[2]
    )
    climate = usage * tariff.climate_per_kwh
    fuel = usage * tariff.fuel_per_kwh
    subtotal = basic + energy_charge + climate + fuel
    vat = round(subtotal * tariff.vat_rate)
    fund = int(subtotal * tariff.fund_rate / 10) * 10
    total = int((subtotal + vat + fund) / 10) * 10

    return {
        "usage_kwh": round(usage, 3),
        "basic": round(basic),
        "energy_charge": round(energy_charge),
        "climate": round(climate),
        "fuel": round(fuel),
        "vat": vat,
        "fund": fund,
        "total": total,
    }
