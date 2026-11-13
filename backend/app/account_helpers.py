"""Database access and savings-ledger helpers used by API routes."""
from decimal import Decimal
from typing import Any
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from .ledger import next_goal_saved, validate_balance_floor, validate_withdrawal

def _fetch_one(
    db: Session,
    statement: str,
    params: dict[str, Any],
) -> Any:
    return (
        db.execute(text(statement), params)
        .mappings()
        .first()
    )


def _fetch_all(
    db: Session,
    statement: str,
    params: dict[str, Any],
) -> list[Any]:
    return list(
        db.execute(text(statement), params)
        .mappings()
        .all()
    )


def _ensure_profile(
    db: Session,
    user: dict[str, Any],
) -> Any:
    user_id = UUID(user["id"])
    metadata = user.get("user_metadata") or {}

    display_name = (
        metadata.get("full_name")
        or metadata.get("name")
        or ""
    )

    try:
        db.execute(
            text(
                """
                INSERT INTO public.user_profiles (
                    id,
                    display_name
                )
                VALUES (
                    :id,
                    :display_name
                )
                ON CONFLICT (id) DO NOTHING
                """
            ),
            {
                "id": user_id,
                "display_name": display_name,
            },
        )

        db.commit()

    except SQLAlchemyError as exc:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail="Could not initialize the user profile.",
        ) from exc

    profile = _fetch_one(
        db,
        """
        SELECT *
        FROM public.user_profiles
        WHERE id = :id
        """,
        {"id": user_id},
    )
    if profile is not None and profile.get("deleted_at") is not None:
        raise HTTPException(
            status_code=403,
            detail="This account has been removed. Contact a superadmin to recover access.",
        )
    return profile


def _goal_delta(
    db: Session,
    user_id: str,
    goal_id: str | UUID | None,
    amount: Decimal | float,
    transaction_type: str,
    direction: int,
) -> None:
    if not goal_id:
        return

    goal_uuid = (
        goal_id
        if isinstance(goal_id, UUID)
        else UUID(str(goal_id))
    )

    goal = db.execute(
        text(
            """
            SELECT saved_amount, target_amount
            FROM public.savings_goals
            WHERE id = :goal_id
              AND user_id = :user_id
            FOR UPDATE
            """
        ),
        {
            "goal_id": goal_uuid,
            "user_id": UUID(user_id),
        },
    ).mappings().first()

    if goal is None:
        raise HTTPException(
            status_code=404,
            detail="The linked savings goal was not found.",
        )

    next_saved = next_goal_saved(
        Decimal(str(goal["saved_amount"])),
        Decimal(str(goal["target_amount"])),
        Decimal(str(amount)),
        transaction_type,
        direction,
    )

    result = db.execute(
        text(
            """
            UPDATE public.savings_goals
            SET saved_amount = :saved_amount,
                updated_at = now()
            WHERE id = :goal_id
              AND user_id = :user_id
            RETURNING id
            """
        ),
        {
            "saved_amount": next_saved,
            "goal_id": goal_uuid,
            "user_id": UUID(user_id),
        },
    ).first()

    if result is None:
        raise HTTPException(
            status_code=404,
            detail="The linked savings goal was not found.",
        )


def _validate_withdrawal(
    db: Session,
    user_id: str,
    amount: Decimal,
    goal_id: str | UUID | None,
    exclude_transaction_id: UUID | None = None,
) -> None:
    params: dict[str, Any] = {
        "user_id": UUID(user_id),
    }

    exclusion = ""

    if exclude_transaction_id:
        exclusion = " AND id <> :exclude_id"
        params["exclude_id"] = exclude_transaction_id

    balance = db.execute(
        text(
            f"""
            SELECT COALESCE(
                SUM(
                    CASE
                        WHEN transaction_type = 'deposit'
                            THEN amount
                        ELSE -amount
                    END
                ),
                0
            )
            FROM public.savings_transactions
            WHERE user_id = :user_id
            {exclusion}
            """
        ),
        params,
    ).scalar_one()

    allocated = db.execute(
        text(
            """
            SELECT COALESCE(SUM(saved_amount), 0)
            FROM public.savings_goals
            WHERE user_id = :user_id
            """
        ),
        {"user_id": UUID(user_id)},
    ).scalar_one()

    goal_saved = None

    if goal_id:
        goal_uuid = (
            goal_id
            if isinstance(goal_id, UUID)
            else UUID(str(goal_id))
        )

        goal_saved = db.execute(
            text(
                """
                SELECT saved_amount
                FROM public.savings_goals
                WHERE id = :goal_id
                  AND user_id = :user_id
                """
            ),
            {
                "goal_id": goal_uuid,
                "user_id": UUID(user_id),
            },
        ).scalar_one_or_none()

        if goal_saved is None:
            raise HTTPException(
                status_code=404,
                detail="The linked savings goal was not found.",
            )

        goal_saved = Decimal(str(goal_saved))

    validate_withdrawal(
        Decimal(str(balance)),
        Decimal(str(allocated)),
        goal_saved,
        amount,
        bool(goal_id),
    )




def _ledger_balance(db: Session, user_id: str) -> Decimal:
    """Recorded balance = deposits - withdrawals, computed in SQL with exact NUMERIC arithmetic."""
    value = db.execute(
        text(
            """
            SELECT COALESCE(SUM(CASE WHEN transaction_type = 'deposit' THEN amount ELSE -amount END), 0)
            FROM public.savings_transactions
            WHERE user_id = :user_id
            """
        ),
        {"user_id": UUID(user_id)},
    ).scalar_one()
    return Decimal(str(value))


def _assert_balance_floor(db: Session, user_id: str, balance_before: Decimal) -> None:
    validate_balance_floor(balance_before, _ledger_balance(db, user_id))
