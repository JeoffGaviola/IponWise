"""Shared pytest fixtures.

Unit tests need nothing. Database integration tests run only when TEST_DATABASE_URL points at a
disposable PostgreSQL database that already has the IponWise schema (see tests/support/README.md).
They never run against Supabase production: the URL must be explicitly provided, and tables are
truncated between tests, so use a throwaway database.
"""
import os
import sys
import uuid
from pathlib import Path

import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

TEST_DATABASE_URL = os.getenv("TEST_DATABASE_URL", "").strip()

USER_A = "11111111-1111-4111-8111-111111111111"
USER_B = "22222222-2222-4222-8222-222222222222"


@pytest.fixture(scope="session")
def db_engine():
    if not TEST_DATABASE_URL:
        pytest.skip("Set TEST_DATABASE_URL to a disposable PostgreSQL database to run integration tests.")
    from sqlalchemy import create_engine, text
    from app.db import normalize_database_url

    engine = create_engine(normalize_database_url(TEST_DATABASE_URL), pool_pre_ping=True)
    with engine.begin() as connection:
        for user_id, email in ((USER_A, "a@example.test"), (USER_B, "b@example.test")):
            connection.execute(
                text("INSERT INTO auth.users (id, email) VALUES (:id, :email) ON CONFLICT (id) DO NOTHING"),
                {"id": user_id, "email": email},
            )
    yield engine
    engine.dispose()


@pytest.fixture()
def api(db_engine):
    """TestClient whose auth dependency trusts an X-Test-User header and whose DB is the test DB.

    Only Supabase token verification is replaced; every route, query and transaction is real.
    """
    from fastapi import Header
    from fastapi.testclient import TestClient
    from sqlalchemy import text
    from sqlalchemy.orm import sessionmaker

    from app.auth import get_current_user
    from app.db import get_db
    from app.main import app

    with db_engine.begin() as connection:
        connection.execute(text(
            "TRUNCATE public.savings_transactions, public.savings_goals, public.savings_reminders, "
            "public.user_wallets, public.wallet_balance_history, public.user_profiles CASCADE"
        ))

    factory = sessionmaker(bind=db_engine, autoflush=False, autocommit=False, expire_on_commit=False)

    def override_db():
        session = factory()
        try:
            yield session
        finally:
            session.close()

    def override_user(x_test_user: str | None = Header(default=None)):
        from fastapi import HTTPException

        if not x_test_user:
            raise HTTPException(status_code=401, detail="Sign in to continue.")
        return {"id": x_test_user, "email": f"{x_test_user[:4]}@example.test", "user_metadata": {}}

    app.dependency_overrides[get_current_user] = override_user
    app.dependency_overrides[get_db] = override_db
    client = TestClient(app)
    try:
        yield client
    finally:
        app.dependency_overrides.clear()


@pytest.fixture()
def as_a():
    return {"X-Test-User": USER_A}


@pytest.fixture()
def as_b():
    return {"X-Test-User": USER_B}


def new_id() -> str:
    return str(uuid.uuid4())
