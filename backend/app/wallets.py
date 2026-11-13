"""User-owned wallet / account tracking endpoints.

IponWise is a READ-ONLY tracker. It never connects to a bank or e-wallet provider, never moves money,
and never stores card numbers, expiry dates, CVVs, PINs or OTPs. For ATM/debit cards only the last four
digits and the network are kept. Balances are snapshots the user enters; every snapshot is recorded in
`wallet_balance_history` so the app can draw a trend and nudge the user when a balance has gone stale.
"""
from collections import defaultdict
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from .auth import get_current_user
from .db import get_db
from .schemas import WalletCreate, WalletUpdate
from .serializers import _date_str

router = APIRouter(prefix="/api/wallets", tags=["wallets"])

TREND_POINTS = 12
MIGRATION_HINT = "Check that migration 006_wallet_tracking_and_onboarding.sql has been applied in Supabase."


def serialize_wallet(row: Any, trend: list[float] | None = None) -> dict[str, Any]:
    return {
        "id": str(row["id"]),
        "name": row["name"],
        "provider": row["provider"],
        "kind": row["kind"],
        "balance": float(row["balance"]),
        "currencyCode": row["currency_code"],
        "note": row["note"] or "",
        "source": row.get("source") or "manual",
        "cardLast4": row.get("card_last4"),
        "cardNetwork": row.get("card_network"),
        "accountTail": row.get("account_tail"),
        "lastCheckedAt": _date_str(row.get("last_checked_at")) or _date_str(row.get("updated_at")),
        "updatedAt": _date_str(row.get("updated_at")),
        "trend": trend if trend is not None else [],
    }


def _owned_wallet(db: Session, user_id: UUID, wallet_id: UUID):
    return db.execute(
        text("SELECT * FROM public.user_wallets WHERE id=:id AND user_id=:user_id"),
        {"id": wallet_id, "user_id": user_id},
    ).mappings().first()


def _trends(db: Session, user_id: UUID, wallet_ids: list[UUID]) -> dict[str, list[float]]:
    """Last TREND_POINTS balances per wallet, oldest first. Never fails the request if history is unavailable."""
    if not wallet_ids:
        return {}
    try:
        rows = db.execute(
            text(
                """
                SELECT wallet_id, balance FROM (
                    SELECT wallet_id, balance, recorded_at, id,
                           row_number() OVER (PARTITION BY wallet_id ORDER BY recorded_at DESC, id DESC) AS rn
                    FROM public.wallet_balance_history
                    WHERE user_id = :user_id AND wallet_id = ANY(:ids)
                ) ranked
                WHERE rn <= :points
                ORDER BY wallet_id, recorded_at ASC, id ASC
                """
            ),
            {"user_id": user_id, "ids": wallet_ids, "points": TREND_POINTS},
        ).mappings().all()
    except SQLAlchemyError:
        db.rollback()  # history table missing (migration 006 not applied) must not break the accounts list
        return {}
    grouped: dict[str, list[float]] = defaultdict(list)
    for row in rows:
        grouped[str(row["wallet_id"])].append(float(row["balance"]))
    return grouped


def _record_history(db: Session, user_id: UUID, wallet_id: UUID, balance: Any, reason: str) -> None:
    db.execute(
        text(
            "INSERT INTO public.wallet_balance_history (wallet_id, user_id, balance, reason) "
            "VALUES (:wallet_id, :user_id, :balance, :reason)"
        ),
        {"wallet_id": wallet_id, "user_id": user_id, "balance": balance, "reason": reason},
    )


@router.get("")
def list_wallets(user: dict[str, Any] = Depends(get_current_user), db: Session = Depends(get_db)):
    user_id = UUID(user["id"])
    rows = db.execute(
        text("SELECT * FROM public.user_wallets WHERE user_id=:user_id ORDER BY updated_at DESC, created_at DESC"),
        {"user_id": user_id},
    ).mappings().all()
    trends = _trends(db, user_id, [row["id"] for row in rows])
    return [serialize_wallet(row, trends.get(str(row["id"]), [])) for row in rows]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_wallet(payload: WalletCreate, user: dict[str, Any] = Depends(get_current_user), db: Session = Depends(get_db)):
    user_id = UUID(user["id"])
    try:
        row = db.execute(
            text(
                """INSERT INTO public.user_wallets
                   (user_id, name, provider, kind, balance, currency_code, note, source, card_last4, card_network, account_tail)
                   VALUES (:user_id, :name, :provider, :kind, :balance, :currency_code, :note, :source, :card_last4, :card_network, :account_tail)
                   RETURNING *"""
            ),
            {
                "user_id": user_id,
                "name": payload.name,
                "provider": payload.provider,
                "kind": payload.kind,
                "balance": payload.balance,
                "currency_code": payload.currency_code,
                "note": payload.note,
                "source": payload.source,
                "card_last4": payload.card_last4,
                "card_network": payload.card_network,
                "account_tail": payload.account_tail,
            },
        ).mappings().one()
        _record_history(db, user_id, row["id"], row["balance"], "created")
        db.commit()
        return serialize_wallet(row, [float(row["balance"])])
    except IntegrityError as exc:
        db.rollback()
        if "user_wallets" in str(exc.orig).lower() or "duplicate key" in str(exc.orig).lower():
            raise HTTPException(status_code=409, detail="You're already tracking this account.") from exc
        raise HTTPException(status_code=400, detail=f"Could not save this account. {MIGRATION_HINT}") from exc
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Could not save this account. {MIGRATION_HINT}") from exc


@router.patch("/{wallet_id}")
def update_wallet(wallet_id: UUID, payload: WalletUpdate, user: dict[str, Any] = Depends(get_current_user), db: Session = Depends(get_db)):
    user_id = UUID(user["id"])
    updates = payload.model_dump(exclude_unset=True)
    existing = _owned_wallet(db, user_id, wallet_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="Account not found.")
    if not updates:
        return serialize_wallet(existing, _trends(db, user_id, [wallet_id]).get(str(wallet_id), []))

    columns = {"name", "provider", "kind", "balance", "currency_code", "note", "card_last4", "card_network", "account_tail"}
    updates = {key: value for key, value in updates.items() if key in columns}
    if not updates:
        raise HTTPException(status_code=400, detail="No supported fields were provided.")

    assignments = [f"{key} = :{key}" for key in updates]
    balance_touched = "balance" in updates
    if balance_touched:
        assignments.append("last_checked_at = now()")
    params = {**updates, "wallet_id": wallet_id, "user_id": user_id}
    try:
        row = db.execute(
            text(f"UPDATE public.user_wallets SET {', '.join(assignments)}, updated_at=now() WHERE id=:wallet_id AND user_id=:user_id RETURNING *"),
            params,
        ).mappings().first()
        if row is None:
            raise HTTPException(status_code=404, detail="Account not found.")
        if balance_touched:
            # An unchanged balance records a freshness check-in.
            reason = "check-in" if row["balance"] == existing["balance"] else "update"
            _record_history(db, user_id, wallet_id, row["balance"], reason)
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Could not update this account. {MIGRATION_HINT}") from exc
    return serialize_wallet(row, _trends(db, user_id, [wallet_id]).get(str(wallet_id), []))


@router.get("/{wallet_id}/history")
def wallet_history(
    wallet_id: UUID,
    limit: int = Query(default=90, ge=1, le=365),
    user: dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_id = UUID(user["id"])
    if _owned_wallet(db, user_id, wallet_id) is None:
        raise HTTPException(status_code=404, detail="Account not found.")
    try:
        rows = db.execute(
            text(
                """SELECT balance, reason, recorded_at FROM public.wallet_balance_history
                   WHERE wallet_id=:wallet_id AND user_id=:user_id
                   ORDER BY recorded_at DESC, id DESC LIMIT :limit"""
            ),
            {"wallet_id": wallet_id, "user_id": user_id, "limit": limit},
        ).mappings().all()
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Could not load balance history. {MIGRATION_HINT}") from exc
    return [{"balance": float(r["balance"]), "reason": r["reason"], "recordedAt": _iso(r["recorded_at"])} for r in rows]


@router.delete("/{wallet_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_wallet(wallet_id: UUID, user: dict[str, Any] = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        result = db.execute(
            text("DELETE FROM public.user_wallets WHERE id=:wallet_id AND user_id=:user_id RETURNING id"),
            {"wallet_id": wallet_id, "user_id": UUID(user["id"])},
        )
        if result.first() is None:
            raise HTTPException(status_code=404, detail="Account not found.")
        db.commit()
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    except HTTPException:
        db.rollback()
        raise
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Could not delete this account.") from exc
