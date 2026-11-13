"""IponWise REST API: Supabase Auth and PostgreSQL savings tracker."""

import os
from contextlib import asynccontextmanager
from datetime import date, timedelta
from typing import Any
from uuid import UUID

from .config import load_environment

# Load configuration before importing modules that initialize clients.
load_environment()

from fastapi import (
    Depends,
    FastAPI,
    HTTPException,
    Query,
    Response,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from .assistant import router as assistant_router
from .account_helpers import (
    _assert_balance_floor,
    _fetch_all,
    _fetch_one,
    _ensure_profile,
    _goal_delta,
    _ledger_balance,
    _validate_withdrawal,
)
from .ledger import lock_user_ledger, resolve_today
from .auth import close_auth_client, get_current_user, init_auth_client
from .avatars import router as avatar_router
from .db import engine, get_db
from .schemas import (
    GoalCreate,
    GoalUpdate,
    ProfileUpdate,
    ReminderCreate,
    ReminderUpdate,
    TransactionCreate,
    TransactionUpdate,
)
from .serializers import _id_str, _transaction, _goal, _reminder
from .wallets import router as wallet_router

@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_auth_client()
    try:
        yield
    finally:
        await close_auth_client()
        if engine is not None:
            engine.dispose()


app = FastAPI(
    title="IponWise API",
    description=(
        "Secure API for the IponWise personal savings tracker. "
        "Supabase Auth verifies sessions, PostgreSQL stores "
        "user-owned records, and Supabase Storage handles "
        "private profile pictures."
    ),
    version="1.1.0",
    lifespan=lifespan,
)

origins = [
    origin.strip()
    for origin in os.getenv(
        "FRONTEND_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=[
        "GET",
        "POST",
        "PUT",
        "PATCH",
        "DELETE",
        "OPTIONS",
    ],
    allow_headers=[
        "Authorization",
        "Content-Type",
        "Accept",
    ],
)

app.include_router(avatar_router)
app.include_router(wallet_router)
app.include_router(assistant_router)


# System and profile routes
@app.get("/")
def root() -> dict[str, str]:
    return {
        "name": "IponWise API",
        "status": "ok",
        "version": "1.1.0",
        "docs": "/docs",
    }


@app.get("/api/health")
def health() -> dict[str, Any]:
    result: dict[str, Any] = {
        "status": "ok",
        "service": "iponwise-api",
        "database_configured": engine is not None,
        "database_connected": False,
    }

    if engine is None:
        result["status"] = "degraded"
        result["database_message"] = (
            "DATABASE_URL is not configured. "
            "Copy backend/.env.example to backend/.env."
        )
        return result

    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))

        result["database_connected"] = True
        result["database_message"] = (
            "PostgreSQL connection successful."
        )

    except SQLAlchemyError as exc:
        result["status"] = "degraded"
        message = str(exc).lower()
        if "failed to resolve host" in message or "getaddrinfo" in message:
            result["database_message"] = (
                "The configured database hostname cannot be resolved. "
                "Use the current Supabase Session pooler URI in DATABASE_URL."
            )
        else:
            result["database_message"] = (
                "Could not connect to PostgreSQL. Check the Supabase connection "
                "string, credentials, network access, and SSL settings."
            )

    return result


@app.get("/api/me")
def me(
    user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    return {
        "id": user["id"],
        "email": user.get("email"),
        "user_metadata": user.get("user_metadata") or {},
    }


def require_superadmin(
    user: dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    profile = _ensure_profile(db, user)
    if profile is None or profile["role"] != "superadmin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Superadmin access is required.",
        )
    return user


@app.get("/api/admin/users")
def admin_users(
    _user: dict[str, Any] = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    rows = _fetch_all(
        db,
        """
        SELECT
            p.id,
            coalesce(u.email, p.email_address) AS email,
            p.display_name,
            p.role,
            u.created_at AS registered_at,
            p.last_sign_in_at,
            p.deleted_at
        FROM public.user_profiles p
        LEFT JOIN auth.users u ON u.id = p.id
        ORDER BY u.created_at ASC NULLS LAST, p.id ASC
        """,
        {},
    )
    return {
        "users": [
            {
                "id": str(row["id"]),
                "email": row["email"],
                "display_name": row["display_name"],
                "role": row["role"],
                "registered_at": row["registered_at"],
                "last_sign_in_at": row["last_sign_in_at"],
                "deleted_at": row["deleted_at"],
                "status": "removed" if row["deleted_at"] is not None else "active",
            }
            for row in rows
        ],
    }


@app.delete("/api/admin/users/{user_id}")
def remove_admin_user(
    user_id: UUID,
    current_user: dict[str, Any] = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    if str(user_id) == current_user["id"]:
        raise HTTPException(status_code=400, detail="You cannot remove your own superadmin account.")
    result = db.execute(
        text(
            """
            UPDATE public.user_profiles
            SET deleted_at = coalesce(deleted_at, now()), updated_at = now()
            WHERE id = :user_id AND role = 'user'
            RETURNING id
            """
        ),
        {"user_id": user_id},
    ).first()
    if result is None:
        raise HTTPException(status_code=404, detail="Active regular user not found.")
    db.commit()
    return {"status": "removed"}


@app.post("/api/admin/users/{user_id}/restore")
def restore_admin_user(
    user_id: UUID,
    _current_user: dict[str, Any] = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    result = db.execute(
        text(
            """
            UPDATE public.user_profiles
            SET deleted_at = NULL, updated_at = now()
            WHERE id = :user_id AND role = 'user' AND deleted_at IS NOT NULL
            RETURNING id
            """
        ),
        {"user_id": user_id},
    ).first()
    if result is None:
        raise HTTPException(status_code=404, detail="Removed regular user not found.")
    db.commit()
    return {"status": "restored"}


@app.get("/api/profile")
def get_profile(
    user: dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    row = _ensure_profile(db, user)

    if row is None:
        raise HTTPException(
            status_code=404,
            detail="User profile not found.",
        )

    return {
        "id": str(row["id"]),
        "role": row["role"],
        "display_name": row["display_name"],
        "currency_code": row["currency_code"].strip(),
        "theme": row["theme"],
        "email_summaries_enabled": (
            row["email_summaries_enabled"]
        ),
        "savings_reminders_enabled": (
            row["savings_reminders_enabled"]
        ),
        "onboarding_dismissed": bool(
            row.get("onboarding_dismissed", False)
        ),
    }


@app.patch("/api/profile")
def update_profile(
    payload: ProfileUpdate,
    user: dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    _ensure_profile(db, user)

    updates = payload.model_dump(exclude_unset=True)

    if not updates:
        return get_profile(user, db)

    if (
        "display_name" in updates
        and updates["display_name"] is not None
    ):
        updates["display_name"] = updates[
            "display_name"
        ].strip()

    allowed_columns = {
        "display_name": "display_name",
        "currency_code": "currency_code",
        "theme": "theme",
        "email_summaries_enabled": (
            "email_summaries_enabled"
        ),
        "savings_reminders_enabled": (
            "savings_reminders_enabled"
        ),
        "onboarding_dismissed": "onboarding_dismissed",
    }

    invalid_fields = set(updates) - set(allowed_columns)

    if invalid_fields:
        raise HTTPException(
            status_code=422,
            detail="One or more profile fields are not supported.",
        )

    assignments = ", ".join(
        f"{allowed_columns[key]} = :{key}"
        for key in updates
    )

    params = {
        **updates,
        "id": UUID(user["id"]),
    }

    try:
        db.execute(
            text(
                f"""
                UPDATE public.user_profiles
                SET {assignments},
                    updated_at = now()
                WHERE id = :id
                """
            ),
            params,
        )

        db.commit()

    except SQLAlchemyError as exc:
        db.rollback()

        raise HTTPException(
            status_code=400,
            detail="Profile settings could not be saved.",
        ) from exc

    return get_profile(user, db)


# Transaction routes
@app.get("/api/transactions")
def list_transactions(
    search: str | None = Query(
        default=None,
        max_length=120,
    ),
    transaction_type: str | None = Query(
        default=None,
        alias="type",
        pattern="^(deposit|withdrawal)$",
    ),
    category: str | None = Query(
        default=None,
        max_length=80,
    ),
    month: str | None = Query(
        default=None,
        pattern=r"^\d{4}-\d{2}$",
    ),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    sort_by: str = Query(
        default="date",
        pattern="^(date|amount|category)$",
    ),
    sort_order: str = Query(
        default="desc",
        pattern="^(asc|desc)$",
    ),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    user: dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    if start_date and end_date and start_date > end_date:
        raise HTTPException(
            status_code=422,
            detail="start_date cannot be later than end_date.",
        )

    clauses = ["user_id = :user_id"]
    params: dict[str, Any] = {
        "user_id": UUID(user["id"]),
    }

    if transaction_type:
        clauses.append(
            "transaction_type = :transaction_type"
        )
        params["transaction_type"] = transaction_type

    if month:
        clauses.append(
            "to_char(transaction_date, 'YYYY-MM') = :month"
        )
        params["month"] = month

    if category:
        clauses.append("category = :category")
        params["category"] = category.strip()

    if start_date:
        clauses.append("transaction_date >= :start_date")
        params["start_date"] = start_date

    if end_date:
        clauses.append("transaction_date <= :end_date")
        params["end_date"] = end_date

    if search:
        escaped_search = search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        clauses.append(
            "(category ILIKE :search ESCAPE '\\' OR note ILIKE :search ESCAPE '\\')"
        )
        params["search"] = f"%{escaped_search}%"

    sort_columns = {
        "date": "transaction_date",
        "amount": "amount",
        "category": "category",
    }

    sort_column = sort_columns[sort_by]
    direction = (
        "ASC" if sort_order == "asc" else "DESC"
    )

    params.update({
        "limit": limit,
        "offset": offset,
    })

    rows = _fetch_all(
        db,
        f"""
        SELECT *
        FROM public.savings_transactions
        WHERE {' AND '.join(clauses)}
        ORDER BY {sort_column} {direction}, created_at DESC
        LIMIT :limit OFFSET :offset
        """,
        params,
    )

    return [_transaction(row) for row in rows]


# Goal routes
@app.post(
    "/api/transactions",
    status_code=status.HTTP_201_CREATED,
)
def create_transaction(
    payload: TransactionCreate,
    user: dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        lock_user_ledger(db, user["id"])
        if payload.date < date(2000, 1, 1) or payload.date > date.today() + timedelta(days=1):
            raise HTTPException(status_code=422, detail="Transaction date must be between 2000-01-01 and tomorrow.")
        if payload.type == "withdrawal":
            _validate_withdrawal(
                db,
                user["id"],
                payload.amount,
                payload.goal_id,
            )

        result = db.execute(
            text(
                """
                INSERT INTO public.savings_transactions (
                    user_id,
                    goal_id,
                    transaction_type,
                    category,
                    note,
                    amount,
                    transaction_date
                )
                VALUES (
                    :user_id,
                    :goal_id,
                    :transaction_type,
                    :category,
                    :note,
                    :amount,
                    :transaction_date
                )
                RETURNING *
                """
            ),
            {
                "user_id": UUID(user["id"]),
                "goal_id": payload.goal_id or None,
                "transaction_type": payload.type,
                "category": payload.category,
                "note": payload.note,
                "amount": payload.amount,
                "transaction_date": payload.date,
            },
        ).mappings().one()

        _goal_delta(
            db,
            user["id"],
            payload.goal_id,
            payload.amount,
            payload.type,
            1,
        )

        db.commit()
        return _transaction(result)

    except HTTPException:
        db.rollback()
        raise

    except IntegrityError as exc:
        db.rollback()

        raise HTTPException(
            status_code=400,
            detail=(
                "The transaction is invalid or the linked goal "
                "does not belong to this account."
            ),
        ) from exc

    except SQLAlchemyError as exc:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail="Could not save this transaction.",
        ) from exc


@app.put("/api/transactions/{transaction_id}")
def update_transaction(
    transaction_id: UUID,
    payload: TransactionUpdate,
    user: dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    lock_user_ledger(db, user["id"])
    old = _fetch_one(
        db,
        """
        SELECT *
        FROM public.savings_transactions
        WHERE id = :id
          AND user_id = :user_id
        FOR UPDATE
        """,
        {
            "id": transaction_id,
            "user_id": UUID(user["id"]),
        },
    )

    if old is None:
        raise HTTPException(
            status_code=404,
            detail="Transaction not found.",
        )

    updates = payload.model_dump(exclude_unset=True)

    mapped = {
        "type": "transaction_type",
        "date": "transaction_date",
        "goal_id": "goal_id",
    }

    old_type = old["transaction_type"]
    old_amount = old["amount"]
    old_goal = _id_str(old["goal_id"])

    next_type = updates.get("type", old_type)
    next_amount = updates.get("amount", old_amount)
    next_goal = updates.get("goal_id", old_goal)

    try:
        next_date = updates.get("date", old["transaction_date"])
        if next_date < date(2000, 1, 1) or next_date > date.today() + timedelta(days=1):
            raise HTTPException(status_code=422, detail="Transaction date must be between 2000-01-01 and tomorrow.")
        balance_before = _ledger_balance(db, user["id"])
        _goal_delta(
            db,
            user["id"],
            old_goal,
            old_amount,
            old_type,
            -1,
        )

        if next_type == "withdrawal":
            _validate_withdrawal(
                db,
                user["id"],
                next_amount,
                next_goal,
                transaction_id,
            )

        if updates:
            setters = []
            params: dict[str, Any] = {
                "id": transaction_id,
                "user_id": UUID(user["id"]),
            }

            for key, value in updates.items():
                column = mapped.get(key, key)
                setters.append(f"{column} = :{key}")

                if key == "goal_id" and value:
                    params[key] = (
                        value
                        if isinstance(value, UUID)
                        else UUID(str(value))
                    )
                else:
                    params[key] = value

            setters.append("updated_at = now()")

            result = db.execute(
                text(
                    f"""
                    UPDATE public.savings_transactions
                    SET {', '.join(setters)}
                    WHERE id = :id
                      AND user_id = :user_id
                    RETURNING *
                    """
                ),
                params,
            ).mappings().one()

        else:
            result = old

        _goal_delta(
            db,
            user["id"],
            next_goal,
            next_amount,
            next_type,
            1,
        )

        _assert_balance_floor(db, user["id"], balance_before)
        db.commit()
        return _transaction(result)

    except HTTPException:
        db.rollback()
        raise

    except IntegrityError as exc:
        db.rollback()

        raise HTTPException(
            status_code=400,
            detail=(
                "The updated transaction or linked goal is invalid."
            ),
        ) from exc

    except SQLAlchemyError as exc:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail="Could not update this transaction.",
        ) from exc


@app.delete(
    "/api/transactions/{transaction_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_transaction(
    transaction_id: UUID,
    user: dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    lock_user_ledger(db, user["id"])
    row = _fetch_one(
        db,
        """
        SELECT *
        FROM public.savings_transactions
        WHERE id = :id
          AND user_id = :user_id
        FOR UPDATE
        """,
        {
            "id": transaction_id,
            "user_id": UUID(user["id"]),
        },
    )

    if row is None:
        raise HTTPException(
            status_code=404,
            detail="Transaction not found.",
        )

    try:
        balance_before = _ledger_balance(db, user["id"])
        _goal_delta(
            db,
            user["id"],
            _id_str(row["goal_id"]),
            row["amount"],
            row["transaction_type"],
            -1,
        )

        db.execute(
            text(
                """
                DELETE FROM public.savings_transactions
                WHERE id = :id
                  AND user_id = :user_id
                """
            ),
            {
                "id": transaction_id,
                "user_id": UUID(user["id"]),
            },
        )

        _assert_balance_floor(db, user["id"], balance_before)
        db.commit()
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    except HTTPException:
        db.rollback()
        raise

    except SQLAlchemyError as exc:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail="Could not delete this transaction.",
        ) from exc


@app.get("/api/goals")
def list_goals(
    user: dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    rows = _fetch_all(
        db,
        """
        SELECT *
        FROM public.savings_goals
        WHERE user_id = :user_id
        ORDER BY created_at DESC
        """,
        {"user_id": UUID(user["id"])},
    )

    return [_goal(row) for row in rows]


@app.post(
    "/api/goals",
    status_code=status.HTTP_201_CREATED,
)
def create_goal(
    payload: GoalCreate,
    user: dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        lock_user_ledger(db, user["id"])
        row = db.execute(
            text(
                """
                INSERT INTO public.savings_goals (
                    user_id,
                    name,
                    category,
                    target_amount,
                    saved_amount,
                    deadline,
                    color,
                    priority,
                    description,
                    contribution_frequency
                )
                VALUES (
                    :user_id,
                    :name,
                    :category,
                    :target,
                    :saved,
                    :deadline,
                    :color,
                    :priority,
                    :description,
                    :contribution_frequency
                )
                RETURNING *
                """
            ),
            {
                "user_id": UUID(user["id"]),
                **payload.model_dump(),
            },
        ).mappings().one()

        if payload.saved > 0:
            db.execute(
                text(
                    """
                    INSERT INTO public.savings_transactions (
                        user_id, goal_id, transaction_type, category, note,
                        amount, transaction_date
                    )
                    VALUES (
                        :user_id, :goal_id, 'deposit', 'Opening balance',
                        :note, :amount, :transaction_date
                    )
                    """
                ),
                {
                    "user_id": UUID(user["id"]),
                    "goal_id": row["id"],
                    "note": f"Starting amount for {payload.name}",
                    "amount": payload.saved,
                    "transaction_date": date.today(),
                },
            )

        db.commit()
        return _goal(row)

    except IntegrityError as exc:
        db.rollback()

        raise HTTPException(
            status_code=400,
            detail="Could not create this savings goal.",
        ) from exc


@app.patch("/api/goals/{goal_id}")
def update_goal(
    goal_id: UUID,
    payload: GoalUpdate,
    user: dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    updates = payload.model_dump(exclude_unset=True)

    if "target" in updates:
        current_saved = db.execute(
            text(
                """
                SELECT saved_amount
                FROM public.savings_goals
                WHERE id = :id
                  AND user_id = :user_id
                FOR UPDATE
                """
            ),
            {
                "id": goal_id,
                "user_id": UUID(user["id"]),
            },
        ).scalar_one_or_none()

        if current_saved is None:
            raise HTTPException(
                status_code=404,
                detail="Savings goal not found.",
            )

        if updates["target"] < current_saved:
            raise HTTPException(
                status_code=400,
                detail=(
                    "The target cannot be lower than the "
                    "amount already saved."
                ),
            )

    if not updates:
        row = _fetch_one(
            db,
            """
            SELECT *
            FROM public.savings_goals
            WHERE id = :id AND user_id = :user_id
            """,
            {
                "id": goal_id,
                "user_id": UUID(user["id"]),
            },
        )

    else:
        mapped = {"target": "target_amount"}

        setters = []
        params: dict[str, Any] = {
            "id": goal_id,
            "user_id": UUID(user["id"]),
        }

        allowed_columns = {
            "name",
            "category",
            "target",
            "deadline",
            "color",
            "priority",
            "description",
            "contribution_frequency",
        }

        if set(updates) - allowed_columns:
            raise HTTPException(
                status_code=422,
                detail="One or more savings-goal fields are invalid.",
            )

        for key, value in updates.items():
            setters.append(
                f"{mapped.get(key, key)} = :{key}"
            )
            params[key] = value

        setters.append("updated_at = now()")

        try:
            row = db.execute(
                text(
                    f"""
                    UPDATE public.savings_goals
                    SET {', '.join(setters)}
                    WHERE id = :id
                      AND user_id = :user_id
                    RETURNING *
                    """
                ),
                params,
            ).mappings().first()

            db.commit()

        except SQLAlchemyError as exc:
            db.rollback()

            raise HTTPException(
                status_code=400,
                detail="Could not update the savings goal.",
            ) from exc

    if row is None:
        raise HTTPException(
            status_code=404,
            detail="Savings goal not found.",
        )

    return _goal(row)


@app.delete(
    "/api/goals/{goal_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_goal(
    goal_id: UUID,
    user: dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    try:
        result = db.execute(
            text(
                """
                DELETE FROM public.savings_goals
                WHERE id = :id
                  AND user_id = :user_id
                """
            ),
            {
                "id": goal_id,
                "user_id": UUID(user["id"]),
            },
        )

        if result.rowcount == 0:
            db.rollback()
            raise HTTPException(
                status_code=404,
                detail="Savings goal not found.",
            )

        db.commit()
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    except HTTPException:
        raise

    except SQLAlchemyError as exc:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail="Could not delete the savings goal.",
        ) from exc


# Reminder routes
@app.get("/api/reminders")
def list_reminders(
    user: dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    rows = _fetch_all(
        db,
        """
        SELECT *
        FROM public.savings_reminders
        WHERE user_id = :user_id
        ORDER BY created_at DESC
        """,
        {"user_id": UUID(user["id"])},
    )

    return [_reminder(row) for row in rows]


@app.post(
    "/api/reminders",
    status_code=status.HTTP_201_CREATED,
)
def create_reminder(
    payload: ReminderCreate,
    user: dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        row = db.execute(
            text(
                """
                INSERT INTO public.savings_reminders (
                    user_id,
                    title,
                    detail,
                    schedule_label,
                    reminder_type,
                    is_active,
                    due_date,
                    completed
                )
                VALUES (
                    :user_id,
                    :title,
                    :detail,
                    :time,
                    :kind,
                    :active,
                    :due_date,
                    :completed
                )
                RETURNING *
                """
            ),
            {
                "user_id": UUID(user["id"]),
                **payload.model_dump(),
            },
        ).mappings().one()

        db.commit()
        return _reminder(row)

    except IntegrityError as exc:
        db.rollback()

        raise HTTPException(
            status_code=400,
            detail="Could not create this reminder.",
        ) from exc


@app.patch("/api/reminders/{reminder_id}")
def update_reminder(
    reminder_id: UUID,
    payload: ReminderUpdate,
    user: dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    updates = payload.model_dump(exclude_unset=True)

    mapped = {
        "time": "schedule_label",
        "kind": "reminder_type",
        "active": "is_active",
        "due_date": "due_date",
        "completed": "completed",
    }

    allowed_columns = {
        "title",
        "detail",
        "time",
        "kind",
        "active",
        "due_date",
        "completed",
    }

    if set(updates) - allowed_columns:
        raise HTTPException(
            status_code=422,
            detail="One or more reminder fields are invalid.",
        )

    if updates:
        setters = []
        params: dict[str, Any] = {
            "id": reminder_id,
            "user_id": UUID(user["id"]),
        }

        for key, value in updates.items():
            column = mapped.get(key, key)
            setters.append(f"{column} = :{key}")
            params[key] = value

        setters.append("updated_at = now()")

        try:
            row = db.execute(
                text(
                    f"""
                    UPDATE public.savings_reminders
                    SET {', '.join(setters)}
                    WHERE id = :id
                      AND user_id = :user_id
                    RETURNING *
                    """
                ),
                params,
            ).mappings().first()

            db.commit()

        except SQLAlchemyError as exc:
            db.rollback()

            raise HTTPException(
                status_code=400,
                detail="Could not update this reminder.",
            ) from exc

    else:
        row = _fetch_one(
            db,
            """
            SELECT *
            FROM public.savings_reminders
            WHERE id = :id
              AND user_id = :user_id
            """,
            {
                "id": reminder_id,
                "user_id": UUID(user["id"]),
            },
        )

    if row is None:
        raise HTTPException(
            status_code=404,
            detail="Reminder not found.",
        )

    return _reminder(row)


@app.delete(
    "/api/reminders/{reminder_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_reminder(
    reminder_id: UUID,
    user: dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    try:
        result = db.execute(
            text(
                """
                DELETE FROM public.savings_reminders
                WHERE id = :id
                  AND user_id = :user_id
                """
            ),
            {
                "id": reminder_id,
                "user_id": UUID(user["id"]),
            },
        )

        if result.rowcount == 0:
            db.rollback()
            raise HTTPException(
                status_code=404,
                detail="Reminder not found.",
            )

        db.commit()
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    except HTTPException:
        raise

    except SQLAlchemyError as exc:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail="Could not delete this reminder.",
        ) from exc


# Dashboard and reporting routes
@app.get("/api/dashboard")
def dashboard(
    today: date | None = Query(default=None),
    user: dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    resolved_today = resolve_today(today)
    summary = _fetch_one(
        db,
        """
        SELECT
            COALESCE(
                SUM(
                    CASE
                        WHEN transaction_type = 'deposit'
                            THEN amount
                        ELSE -amount
                    END
                ),
                0
            ) AS balance,

            COALESCE(
                SUM(
                    CASE
                        WHEN transaction_type = 'deposit'
                         AND date_trunc(
                             'month', transaction_date
                         ) = date_trunc('month', :today)
                            THEN amount
                        ELSE 0
                    END
                ),
                0
            ) AS month_deposits,

            COALESCE(
                SUM(
                    CASE
                        WHEN transaction_type = 'withdrawal'
                         AND date_trunc(
                             'month', transaction_date
                         ) = date_trunc('month', :today)
                            THEN amount
                        ELSE 0
                    END
                ),
                0
            ) AS month_withdrawals

        FROM public.savings_transactions
        WHERE user_id = :user_id
        """,
        {"user_id": UUID(user["id"]), "today": resolved_today},
    )

    goals = _fetch_one(
        db,
        """
        SELECT
            COALESCE(SUM(saved_amount), 0) AS goals_saved,
            COALESCE(SUM(target_amount), 0) AS goals_target,
            COUNT(*) AS goal_count,
            COUNT(*) FILTER (WHERE saved_amount >= target_amount) AS completed_goals
        FROM public.savings_goals
        WHERE user_id = :user_id
        """,
        {"user_id": UUID(user["id"])},
    )

    counts = _fetch_one(
        db,
        "SELECT COUNT(*) AS transaction_count FROM public.savings_transactions WHERE user_id = :user_id",
        {"user_id": UUID(user["id"])},
    )

    return {
        "balance": float(summary["balance"]),
        "month_deposits": float(summary["month_deposits"]),
        "month_withdrawals": float(
            summary["month_withdrawals"]
        ),
        "goals_saved": float(goals["goals_saved"]),
        "goals_target": float(goals["goals_target"]),
        "goal_count": int(goals["goal_count"]),
        "completed_goals": int(goals["completed_goals"]),
        "transaction_count": int(counts["transaction_count"]),
    }


@app.get("/api/reports")
def reports(
    today: date | None = Query(default=None),
    user: dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    user_id = UUID(user["id"])
    resolved_today = resolve_today(today)

    monthly = _fetch_all(
        db,
        """
        SELECT
            to_char(
                date_trunc('month', transaction_date),
                'YYYY-MM'
            ) AS month,

            COALESCE(
                SUM(
                    CASE
                        WHEN transaction_type = 'deposit'
                            THEN amount
                        ELSE 0
                    END
                ),
                0
            ) AS deposits,

            COALESCE(
                SUM(
                    CASE
                        WHEN transaction_type = 'withdrawal'
                            THEN amount
                        ELSE 0
                    END
                ),
                0
            ) AS withdrawals

        FROM public.savings_transactions
        WHERE user_id = :user_id
          AND transaction_date >= (
              date_trunc('month', :today) - INTERVAL '5 months'
          )
        GROUP BY 1
        ORDER BY 1
        """,
        {"user_id": user_id, "today": resolved_today},
    )

    categories = _fetch_all(
        db,
        """
        SELECT
            category,
            COALESCE(SUM(amount), 0) AS amount
        FROM public.savings_transactions
        WHERE user_id = :user_id
          AND transaction_type = 'withdrawal'
          AND transaction_date >= (
              date_trunc('month', :today) - INTERVAL '5 months'
          )
        GROUP BY category
        ORDER BY amount DESC
        LIMIT 10
        """,
        {"user_id": user_id, "today": resolved_today},
    )

    return {
        "monthly": [
            {
                "month": row["month"],
                "deposits": float(row["deposits"]),
                "withdrawals": float(row["withdrawals"]),
            }
            for row in monthly
        ],
        "withdrawal_categories": [
            {
                "category": row["category"],
                "amount": float(row["amount"]),
            }
            for row in categories
        ],
    }
