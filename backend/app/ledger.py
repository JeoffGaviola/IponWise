"""Pure ledger rules shared by API operations and scenario tests."""
from datetime import date
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import text


def resolve_today(value: date | None) -> date:
    """Accept a client-local date only when it is close to the server's UTC date."""
    server_today = date.today()
    if value is not None and abs((value - server_today).days) <= 1:
        return value
    return server_today


def lock_user_ledger(db, user_id: str) -> None:
    db.execute(
        text("SELECT pg_advisory_xact_lock(hashtextextended(:user_id, 0))"),
        {"user_id": str(user_id)},
    )


def next_goal_saved(saved: Decimal, target: Decimal, amount: Decimal, transaction_type: str, direction: int) -> Decimal:
    """Return a goal's saved amount after applying (direction=1) or reversing (direction=-1) a transaction.

    Raises instead of silently clamping, so an inconsistent ledger is reported rather than hidden.
    """
    delta = amount * (Decimal("1") if transaction_type == "deposit" else Decimal("-1")) * direction
    next_saved = saved + delta
    if next_saved < 0:
        raise HTTPException(status_code=400, detail="This change would make the linked goal's saved amount negative.")
    if next_saved > target:
        raise HTTPException(status_code=400, detail="This contribution would exceed the savings goal target.")
    return next_saved


def validate_withdrawal(balance: Decimal, allocated: Decimal, goal_saved: Decimal | None, amount: Decimal, linked_goal: bool) -> None:
    if balance - amount < 0:
        raise HTTPException(status_code=400, detail="This withdrawal would make your recorded balance negative.")
    allocated_after = allocated - (amount if linked_goal else Decimal("0"))
    if balance - amount < allocated_after:
        raise HTTPException(status_code=400, detail="This withdrawal would reduce funds reserved for active savings goals.")
    if linked_goal and (goal_saved is None or goal_saved < amount):
        raise HTTPException(status_code=400, detail="This withdrawal exceeds the linked goal balance.")


def validate_balance_floor(balance_before: Decimal, balance_after: Decimal) -> None:
    """Reject an edit/delete that lowers the recorded balance below zero.

    A balance that was already negative (legacy data) does not block unrelated edits; only changes
    that make it worse are rejected.
    """
    if balance_after < 0 and balance_after < balance_before:
        raise HTTPException(
            status_code=400,
            detail="This change would make your recorded balance negative. Remove or reduce the withdrawals that depend on it first.",
        )
