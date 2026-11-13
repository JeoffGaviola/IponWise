"""Real-SQL integration tests for the savings ledger. Skipped without TEST_DATABASE_URL."""
from decimal import Decimal

import pytest


def tx(api, h, **kw):
    body = {"type": "deposit", "category": "Allowance", "amount": 1000, "date": "2026-10-01", **kw}
    return api.post("/api/transactions", json=body, headers=h)


def goal(api, h, **kw):
    body = {"name": "Emergency fund", "target": 10000, **kw}
    r = api.post("/api/goals", json=body, headers=h)
    assert r.status_code == 201, r.text
    return r.json()


def dash(api, h):
    return api.get("/api/dashboard", headers=h).json()


def test_unauthenticated_requests_are_rejected(api):
    for path in ("/api/transactions", "/api/goals", "/api/reminders", "/api/wallets", "/api/dashboard", "/api/reports"):
        assert api.get(path).status_code == 401


def test_users_cannot_see_or_modify_each_others_records(api, as_a, as_b):
    t = tx(api, as_a).json()
    g = goal(api, as_a)
    assert api.get("/api/transactions", headers=as_b).json() == []
    assert api.get("/api/goals", headers=as_b).json() == []
    assert api.put(f"/api/transactions/{t['id']}", json={"amount": 5}, headers=as_b).status_code == 404
    assert api.delete(f"/api/transactions/{t['id']}", headers=as_b).status_code == 404
    assert api.patch(f"/api/goals/{g['id']}", json={"name": "Hijacked"}, headers=as_b).status_code == 404
    assert api.delete(f"/api/goals/{g['id']}", headers=as_b).status_code == 404
    assert dash(api, as_b)["balance"] == 0
    assert tx(api, as_b, goalId=g["id"]).status_code == 400  # cannot link to someone else's goal


def test_body_user_id_is_ignored(api, as_a, as_b):
    r = api.post("/api/goals", json={"name": "Sneaky", "target": 100, "user_id": "22222222-2222-4222-8222-222222222222"}, headers=as_a)
    assert r.status_code == 201
    assert len(api.get("/api/goals", headers=as_a).json()) == 1
    assert api.get("/api/goals", headers=as_b).json() == []


def test_dashboard_balance_is_computed_server_side_beyond_100_rows(api, as_a):
    for _ in range(105):
        assert tx(api, as_a, amount=10).status_code == 201
    assert len(api.get("/api/transactions", headers=as_a).json()) == 100  # default page size
    assert dash(api, as_a)["balance"] == 1050.0
    assert dash(api, as_a)["transaction_count"] == 105


def test_goal_contribution_updates_progress_and_cannot_exceed_target(api, as_a):
    g = goal(api, as_a, target=1000)
    assert tx(api, as_a, goalId=g["id"], amount=600).status_code == 201
    assert api.get("/api/goals", headers=as_a).json()[0]["saved"] == 600.0
    r = tx(api, as_a, goalId=g["id"], amount=500)
    assert r.status_code == 400 and "exceed" in r.json()["detail"]
    assert api.get("/api/goals", headers=as_a).json()[0]["saved"] == 600.0  # rolled back
    assert dash(api, as_a)["balance"] == 600.0


def test_editing_and_deleting_linked_transactions_recalculates_goal(api, as_a):
    g = goal(api, as_a, target=5000)
    t = tx(api, as_a, goalId=g["id"], amount=1000).json()
    assert api.put(f"/api/transactions/{t['id']}", json={"amount": 1500}, headers=as_a).status_code == 200
    assert api.get("/api/goals", headers=as_a).json()[0]["saved"] == 1500.0
    assert api.delete(f"/api/transactions/{t['id']}", headers=as_a).status_code == 204
    assert api.get("/api/goals", headers=as_a).json()[0]["saved"] == 0.0
    assert dash(api, as_a)["balance"] == 0.0


def test_moving_a_transaction_between_goals_moves_the_progress(api, as_a):
    g1, g2 = goal(api, as_a, name="Goal one"), goal(api, as_a, name="Goal two")
    t = tx(api, as_a, goalId=g1["id"], amount=700).json()
    assert api.put(f"/api/transactions/{t['id']}", json={"goalId": g2["id"]}, headers=as_a).status_code == 200
    saved = {x["name"]: x["saved"] for x in api.get("/api/goals", headers=as_a).json()}
    assert saved == {"Goal one": 0.0, "Goal two": 700.0}


def test_withdrawal_cannot_overdraw_or_touch_reserved_goal_money(api, as_a):
    tx(api, as_a, amount=1000)
    assert tx(api, as_a, type="withdrawal", category="Bills", amount=1500).status_code == 400
    g = goal(api, as_a, target=5000)
    tx(api, as_a, goalId=g["id"], amount=800)  # balance 1800, 800 reserved
    r = tx(api, as_a, type="withdrawal", category="Bills", amount=1200)
    assert r.status_code == 400 and "reserved" in r.json()["detail"]
    assert tx(api, as_a, type="withdrawal", category="Bills", amount=1000).status_code == 201


def test_emergency_withdrawal_from_a_goal_reduces_goal_and_balance(api, as_a):
    g = goal(api, as_a, name="Emergency fund", priority="essential", target=5000)
    tx(api, as_a, goalId=g["id"], amount=2000)
    r = tx(api, as_a, type="withdrawal", category="Medical", amount=500, goalId=g["id"])
    assert r.status_code == 201
    assert api.get("/api/goals", headers=as_a).json()[0]["saved"] == 1500.0
    assert dash(api, as_a)["balance"] == 1500.0
    r = tx(api, as_a, type="withdrawal", category="Medical", amount=2000, goalId=g["id"])
    assert r.status_code == 400  # more than the goal holds


def test_deleting_a_deposit_that_funds_withdrawals_is_rejected(api, as_a):
    """Regression: previously returned 204 and left the balance at -600."""
    d = tx(api, as_a, amount=1000).json()
    tx(api, as_a, type="withdrawal", category="Bills", amount=600)
    r = api.delete(f"/api/transactions/{d['id']}", headers=as_a)
    assert r.status_code == 400 and "negative" in r.json()["detail"]
    assert dash(api, as_a)["balance"] == 400.0
    assert len(api.get("/api/transactions", headers=as_a).json()) == 2


def test_shrinking_a_deposit_below_dependent_withdrawals_is_rejected(api, as_a):
    """Regression: previously returned 200 and left the balance at -500."""
    d = tx(api, as_a, amount=1000).json()
    tx(api, as_a, type="withdrawal", category="Bills", amount=600)
    assert api.put(f"/api/transactions/{d['id']}", json={"amount": 100}, headers=as_a).status_code == 400
    assert dash(api, as_a)["balance"] == 400.0
    assert api.put(f"/api/transactions/{d['id']}", json={"amount": 700}, headers=as_a).status_code == 200
    assert dash(api, as_a)["balance"] == 100.0


def test_editing_a_note_never_trips_the_balance_floor(api, as_a):
    d = tx(api, as_a, amount=1000).json()
    assert api.put(f"/api/transactions/{d['id']}", json={"note": "Renamed"}, headers=as_a).status_code == 200


def test_money_uses_exact_decimal_arithmetic(api, as_a):
    for _ in range(10):
        tx(api, as_a, amount="0.10")
    assert Decimal(str(dash(api, as_a)["balance"])) == Decimal("1.0")


@pytest.mark.parametrize("amount", [0, -5, "abc", "10.999"])
def test_invalid_amounts_are_rejected_with_422(api, as_a, amount):
    assert tx(api, as_a, amount=amount).status_code == 422


def test_goal_planning_fields_round_trip(api, as_a):
    g = goal(api, as_a, category="Emergency fund", priority="essential", description="3 months of rent and food",
             contributionFrequency="weekly", deadline="2027-06-01")
    assert (g["priority"], g["contributionFrequency"], g["description"]) == ("essential", "weekly", "3 months of rent and food")
    r = api.patch(f"/api/goals/{g['id']}", json={"priority": "high", "contributionFrequency": "daily"}, headers=as_a)
    assert r.status_code == 200 and r.json()["priority"] == "high" and r.json()["contributionFrequency"] == "daily"
    assert api.post("/api/goals", json={"name": "Bad", "target": 5, "priority": "urgent"}, headers=as_a).status_code == 422


def test_goal_defaults_keep_basic_creation_simple(api, as_a):
    g = goal(api, as_a)
    assert (g["priority"], g["contributionFrequency"], g["description"]) == ("normal", "monthly", "")


def test_goal_target_cannot_drop_below_saved_and_starting_savings_validated(api, as_a):
    g = goal(api, as_a, target=1000, saved=400)
    assert api.patch(f"/api/goals/{g['id']}", json={"target": 300}, headers=as_a).status_code == 400
    assert api.patch(f"/api/goals/{g['id']}", json={"target": 400}, headers=as_a).status_code == 200
    assert api.post("/api/goals", json={"name": "Over", "target": 100, "saved": 200}, headers=as_a).status_code == 422


def test_deleting_a_goal_keeps_its_transactions_and_balance(api, as_a):
    g = goal(api, as_a, target=5000)
    tx(api, as_a, goalId=g["id"], amount=1000)
    assert api.delete(f"/api/goals/{g['id']}", headers=as_a).status_code == 204
    txs = api.get("/api/transactions", headers=as_a).json()
    assert len(txs) == 1 and txs[0]["goalId"] is None
    assert dash(api, as_a)["balance"] == 1000.0


def test_dashboard_goal_totals(api, as_a):
    g = goal(api, as_a, target=1000)
    goal(api, as_a, name="Second goal", target=2000)
    tx(api, as_a, goalId=g["id"], amount=1000)
    d = dash(api, as_a)
    assert (d["goals_saved"], d["goals_target"], d["goal_count"], d["completed_goals"]) == (1000.0, 3000.0, 2, 1)


def test_reports_window_includes_the_whole_oldest_month(api, as_a, db_engine):
    from sqlalchemy import text
    with db_engine.begin() as c:
        c.execute(text("""INSERT INTO public.savings_transactions (user_id, transaction_type, category, amount, transaction_date)
                          VALUES (:u, 'deposit', 'Test', 100, date_trunc('month', CURRENT_DATE) - INTERVAL '5 months')"""),
                  {"u": "11111111-1111-4111-8111-111111111111"})
    months = api.get("/api/reports", headers=as_a).json()["monthly"]
    assert months and months[0]["deposits"] == 100.0


def test_reminder_lifecycle_and_isolation(api, as_a, as_b):
    r = api.post("/api/reminders", json={"title": "Friday deposit", "time": "Every Friday"}, headers=as_a)
    assert r.status_code == 201
    rid = r.json()["id"]
    assert api.patch(f"/api/reminders/{rid}", json={"active": False}, headers=as_a).json()["active"] is False
    assert api.patch(f"/api/reminders/{rid}", json={"completed": True}, headers=as_a).json()["completed"] is True
    assert api.patch(f"/api/reminders/{rid}", json={"completed": True}, headers=as_b).status_code == 404
    assert api.delete(f"/api/reminders/{rid}", headers=as_b).status_code == 404
    assert api.delete(f"/api/reminders/{rid}", headers=as_a).status_code == 204
    assert api.get("/api/reminders", headers=as_a).json() == []


def test_wallet_crud_validation_and_isolation(api, as_a, as_b):
    body = {"name": "Daily funds", "provider": "GCash", "kind": "ewallet", "balance": 500, "currency_code": "PHP", "note": ""}
    w = api.post("/api/wallets", json=body, headers=as_a)
    assert w.status_code == 201
    wid = w.json()["id"]
    assert api.patch(f"/api/wallets/{wid}", json={"balance": 750.5}, headers=as_a).json()["balance"] == 750.5
    assert api.post("/api/wallets", json={**body, "balance": -1}, headers=as_a).status_code == 422
    assert api.get("/api/wallets", headers=as_b).json() == []
    assert api.patch(f"/api/wallets/{wid}", json={"balance": 1}, headers=as_b).status_code == 404
    assert api.delete(f"/api/wallets/{wid}", headers=as_b).status_code == 404
    assert api.delete(f"/api/wallets/{wid}", headers=as_a).status_code == 204


def test_wallet_balance_is_not_added_to_ledger_balance(api, as_a):
    api.post("/api/wallets", json={"name": "Bank", "provider": "BPI", "kind": "bank", "balance": 99999}, headers=as_a)
    assert dash(api, as_a)["balance"] == 0.0


def test_profile_preferences_persist(api, as_a):
    r = api.patch("/api/profile", json={"display_name": "  Maria  ", "theme": "dark", "currency_code": "USD"}, headers=as_a)
    assert r.status_code == 200
    p = api.get("/api/profile", headers=as_a).json()
    assert (p["display_name"], p["theme"], p["currency_code"]) == ("Maria", "dark", "USD")
    assert api.patch("/api/profile", json={"theme": "neon"}, headers=as_a).status_code == 422


def test_transaction_filters_and_pagination(api, as_a):
    tx(api, as_a, category="Allowance", note="weekly", date="2026-09-01")
    tx(api, as_a, category="Gift", note="birthday", date="2026-10-02")
    tx(api, as_a, type="withdrawal", category="Bills", amount=100, date="2026-10-03")
    assert len(api.get("/api/transactions", params={"type": "withdrawal"}, headers=as_a).json()) == 1
    assert len(api.get("/api/transactions", params={"month": "2026-10"}, headers=as_a).json()) == 2
    assert len(api.get("/api/transactions", params={"search": "birth"}, headers=as_a).json()) == 1
    assert len(api.get("/api/transactions", params={"limit": 1, "offset": 1}, headers=as_a).json()) == 1
    assert api.get("/api/transactions", params={"start_date": "2026-10-05", "end_date": "2026-10-01"}, headers=as_a).status_code == 422
