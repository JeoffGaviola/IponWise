"""Deterministic recurring-date and cash-flow calculations."""
from calendar import monthrange
from datetime import date, timedelta
from decimal import Decimal


def add_months(value: date, months: int) -> date:
    month_index = value.month - 1 + months
    year, month = value.year + month_index // 12, month_index % 12 + 1
    return date(year, month, min(value.day, monthrange(year, month)[1]))


def occurrence_dates(start: date, end: date | None, frequency: str, until: date) -> list[date]:
    if start > until or (end and end < start):
        return []
    dates: list[date] = []
    cursor = start
    interval = 1 if frequency == "monthly" else 12
    periods = 0
    step = {"weekly": 7, "biweekly": 14}.get(frequency)
    while cursor <= until:
        if not end or cursor <= end:
            dates.append(cursor)
        if step:
            cursor += timedelta(days=step)
        else:
            periods += 1
            cursor = add_months(start, periods * interval)
    return dates


def forecast_balance(balance: Decimal, occurrences: list[dict], start: date, end: date) -> dict:
    pending = [
        item for item in occurrences
        if start <= item["due_date"] <= end and item["status"] == "pending"
    ]
    deposits = sum((Decimal(str(item["amount"])) for item in pending if item["type"] == "deposit"), Decimal("0"))
    withdrawals = sum((Decimal(str(item["amount"])) for item in pending if item["type"] == "withdrawal"), Decimal("0"))
    return {
        "current_balance": balance,
        "expected_deposits": deposits,
        "expected_withdrawals": withdrawals,
        "net_cash_flow": deposits - withdrawals,
        "projected_balance": balance + deposits - withdrawals,
        "occurrences": pending,
    }
