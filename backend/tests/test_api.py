from fastapi.testclient import TestClient
from pydantic import ValidationError
import pytest
from datetime import date

from app.main import app
from app.schemas import GoalCreate, TransactionCreate, WalletCreate
from app.ledger import next_goal_saved, validate_withdrawal
from app.cashflow import add_months, occurrence_dates
from decimal import Decimal

client = TestClient(app)


def test_root_and_health_are_public():
    assert client.get('/').status_code == 200
    health = client.get('/api/health')
    assert health.status_code == 200
    assert health.json()['service'] == 'iponwise-api'


@pytest.mark.parametrize('path', [
    '/api/me', '/api/profile', '/api/transactions', '/api/goals', '/api/reminders', '/api/dashboard'
])
def test_user_data_routes_require_auth(path):
    response = client.get(path)
    assert response.status_code == 401


def test_transaction_rejects_non_positive_amount():
    with pytest.raises(ValidationError):
        TransactionCreate(type='deposit', category='Allowance', amount=0, date='2026-10-10')


def test_goal_rejects_starting_savings_over_target():
    with pytest.raises(ValidationError):
        GoalCreate(name='Laptop', target=1000, saved=1200)


def test_transaction_history_exposes_server_side_filtering_and_pagination():
    parameters = {
        parameter['name']
        for parameter in app.openapi()['paths']['/api/transactions']['get']['parameters']
    }
    assert {'category', 'start_date', 'end_date', 'sort_by', 'sort_order', 'limit', 'offset'} <= parameters


def test_reports_endpoint_is_authenticated_and_reminder_contract_has_lifecycle_fields():
    assert client.get('/api/reports').status_code == 401
    reminder_fields = app.openapi()['components']['schemas']['ReminderCreate']['properties']
    assert {'due_date', 'completed'} <= reminder_fields.keys()


def test_assistant_requires_authentication_and_rejects_full_card_numbers():
    assert client.post('/api/assistant', json={'message': 'How are my goals doing?'}).status_code == 401
    with pytest.raises(ValidationError, match="full card number"):
        from app.schemas import AssistantRequest
        AssistantRequest(message="My card is 4242 4242 4242 4242")


def test_realistic_savings_journey_preserves_ledger_rules():
    goal_saved = Decimal("0")
    goal_target = Decimal("10000")
    balance = Decimal("0")

    balance += Decimal("5000")  # monthly allowance deposit
    goal_saved = next_goal_saved(goal_saved, goal_target, Decimal("2000"), "deposit", 1)
    balance += Decimal("2000")  # linked contribution
    validate_withdrawal(balance, goal_saved, goal_saved, Decimal("500"), True)
    goal_saved = next_goal_saved(goal_saved, goal_target, Decimal("500"), "withdrawal", 1)
    balance -= Decimal("500")

    assert balance == Decimal("6500")
    assert goal_saved == Decimal("1500")
    with pytest.raises(Exception, match="exceed"):
        next_goal_saved(Decimal("9500"), goal_target, Decimal("600"), "deposit", 1)


def test_wallet_routes_require_authentication():
    assert client.get('/api/wallets').status_code == 401
    assert client.post('/api/wallets', json={
        'name': 'Daily funds', 'provider': 'GCash', 'kind': 'ewallet', 'balance': 500,
        'currency_code': 'PHP', 'note': ''
    }).status_code == 401

def test_wallet_rejects_negative_balance():
    with pytest.raises(ValidationError):
        WalletCreate(name='Daily funds', provider='GCash', kind='ewallet', balance=-1)

def test_wallet_kind_is_restricted_to_supported_account_types():
    with pytest.raises(ValidationError):
        WalletCreate(name='Daily funds', provider='GCash', kind='unknown', balance=100)


def test_recurring_month_end_dates_do_not_drift():
    assert add_months(date(2024, 1, 31), 1).isoformat() == '2024-02-29'
    assert add_months(date(2024, 1, 31), 2).isoformat() == '2024-03-31'
    dates = occurrence_dates(date(2024, 1, 31), None, 'monthly', date(2024, 4, 30))
    assert [item.isoformat() for item in dates] == ['2024-01-31', '2024-02-29', '2024-03-31', '2024-04-30']


def test_next_goal_saved_raises_instead_of_clamping_negative():
    import pytest
    from decimal import Decimal
    from fastapi import HTTPException
    from app.ledger import next_goal_saved

    with pytest.raises(HTTPException) as error:
        next_goal_saved(Decimal("100"), Decimal("1000"), Decimal("300"), "deposit", -1)
    assert error.value.status_code == 400 and "negative" in error.value.detail


def test_validate_balance_floor_only_blocks_changes_that_make_things_worse():
    import pytest
    from decimal import Decimal
    from fastapi import HTTPException
    from app.ledger import validate_balance_floor

    validate_balance_floor(Decimal("100"), Decimal("0"))        # still non-negative: fine
    validate_balance_floor(Decimal("-50"), Decimal("-50"))      # legacy negative, unrelated edit: fine
    validate_balance_floor(Decimal("-50"), Decimal("20"))       # improving: fine
    with pytest.raises(HTTPException):
        validate_balance_floor(Decimal("100"), Decimal("-1"))
    with pytest.raises(HTTPException):
        validate_balance_floor(Decimal("-50"), Decimal("-60"))


def test_goal_schema_accepts_planning_fields_and_rejects_bad_ones():
    import pytest
    from pydantic import ValidationError
    from app.schemas import GoalCreate

    goal = GoalCreate(name="Emergency fund", target="30000", priority="essential", contributionFrequency="weekly", description="x")
    assert goal.priority == "essential" and goal.contribution_frequency == "weekly"
    assert GoalCreate(name="Basic goal", target="10").priority == "normal"
    with pytest.raises(ValidationError):
        GoalCreate(name="Bad", target="10", priority="urgent")
    with pytest.raises(ValidationError):
        GoalCreate(name="Bad", target="10", description="x" * 501)


def test_luhn_checksum_matches_known_test_card_numbers():
    from app.schemas import luhn_valid
    assert luhn_valid("4242424242424242") and luhn_valid("5555555555554444") and luhn_valid("378282246310005")
    assert not luhn_valid("4242424242424241") and not luhn_valid("abcd")


def test_full_card_numbers_are_rejected_in_every_free_text_field():
    from app.schemas import CARD_NUMBER_MESSAGE
    base = dict(name="Payroll ATM", provider="BDO", kind="atm", balance=100)
    for field in ("name", "provider", "note"):
        for shape in ("4242424242424242", "4242 4242 4242 4242", "4242-4242-4242-4242"):
            with pytest.raises(ValidationError, match="full card number"):
                WalletCreate(**{**base, field: f"mine {shape} ok"})
    assert "last 4" in CARD_NUMBER_MESSAGE


def test_ordinary_numbers_in_notes_are_not_mistaken_for_cards():
    ok = WalletCreate(name="Maya savings", provider="Maya", balance=10,
                      note="Mobile 09171234567, ref 20261025, saves 1000000 a year")
    assert ok.note.startswith("Mobile")


def test_card_accounts_keep_only_last4_and_network():
    card = WalletCreate(name="Payroll ATM", provider="BDO", kind="atm", balance=5000, source="card", card_last4="1234", card_network="visa")
    assert card.card_last4 == "1234" and card.card_network == "visa"
    with pytest.raises(ValidationError):
        WalletCreate(name="Payroll ATM", provider="BDO", kind="atm", balance=1, source="card")  # last4 required
    for bad in ("123", "12345", "12a4", "4242424242424242"):
        with pytest.raises(ValidationError):
            WalletCreate(name="Payroll ATM", provider="BDO", kind="atm", balance=1, source="card", card_last4=bad)
    with pytest.raises(ValidationError):
        WalletCreate(name="Payroll ATM", provider="BDO", kind="atm", balance=1, source="card", card_last4="1234", card_network="bitcoin")


def test_wallet_schema_has_no_field_that_could_hold_a_cvv_pin_or_expiry():
    fields = set(app.openapi()["components"]["schemas"]["WalletCreate"]["properties"])
    assert not {f for f in fields if any(w in f.lower() for w in ("cvv", "cvc", "pin", "otp", "expiry", "password", "number"))}


def test_wallet_history_route_requires_authentication():
    assert client.get("/api/wallets/11111111-1111-4111-8111-111111111111/history").status_code == 401
