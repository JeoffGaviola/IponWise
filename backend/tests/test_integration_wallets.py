"""Real-SQL integration tests for read-only account tracking. Skipped without TEST_DATABASE_URL."""
import time

from sqlalchemy import text

BODY = {"name": "Daily funds", "provider": "GCash", "kind": "ewallet", "balance": 500, "currency_code": "PHP", "note": ""}


def make(api, h, **kw):
    r = api.post("/api/wallets", json={**BODY, **kw}, headers=h)
    assert r.status_code == 201, r.text
    return r.json()


def history(api, h, wid):
    r = api.get(f"/api/wallets/{wid}/history", headers=h)
    assert r.status_code == 200, r.text
    return r.json()


def test_new_account_starts_a_history_and_defaults_to_manual(api, as_a):
    w = make(api, as_a)
    assert w["source"] == "manual" and w["cardLast4"] is None and w["cardNetwork"] is None
    assert w["trend"] == [500.0]
    assert [(h["balance"], h["reason"]) for h in history(api, as_a, w["id"])] == [(500.0, "created")]


def test_card_account_stores_only_last4_and_network(api, as_a, db_engine):
    w = make(api, as_a, name="Payroll ATM", provider="BDO", kind="atm", source="card", card_last4="4242", card_network="visa", balance=12500.75)
    assert (w["source"], w["cardLast4"], w["cardNetwork"], w["kind"]) == ("card", "4242", "visa", "atm")
    # Nothing in the row can reconstruct a card number: every text column is free of 13+ digit runs.
    with db_engine.connect() as c:
        row = c.execute(text("SELECT * FROM public.user_wallets WHERE id=:i"), {"i": w["id"]}).mappings().one()
    assert not any(isinstance(v, str) and sum(ch.isdigit() for ch in v) >= 13 for v in row.values())


def test_qr_account_keeps_a_masked_tail_only(api, as_a):
    w = make(api, as_a, source="qr", account_tail="5678", provider="GCash")
    assert (w["source"], w["accountTail"]) == ("qr", "5678")
    assert api.post("/api/wallets", json={**BODY, "account_tail": "123456"}, headers=as_a).status_code == 422


def test_full_card_numbers_are_refused_by_the_api(api, as_a):
    for field in ("name", "provider", "note"):
        r = api.post("/api/wallets", json={**BODY, field: "my card 4242 4242 4242 4242"}, headers=as_a)
        assert r.status_code == 422 and "full card number" in r.text
    assert api.post("/api/wallets", json={**BODY, "source": "card"}, headers=as_a).status_code == 422  # no last4
    assert api.post("/api/wallets", json={**BODY, "source": "card", "card_last4": "4242424242424242"}, headers=as_a).status_code == 422
    assert api.get("/api/wallets", headers=as_a).json() == []  # nothing was saved


def test_every_balance_change_is_recorded_and_unchanged_balance_is_a_checkin(api, as_a):
    w = make(api, as_a)
    wid = w["id"]
    changed = api.patch(f"/api/wallets/{wid}", json={"balance": 800}, headers=as_a).json()
    assert changed["balance"] == 800 and changed["trend"] == [500.0, 800.0]
    api.patch(f"/api/wallets/{wid}", json={"balance": 800}, headers=as_a)
    api.patch(f"/api/wallets/{wid}", json={"note": "renamed only"}, headers=as_a)  # not a balance check
    reasons = [(h["balance"], h["reason"]) for h in reversed(history(api, as_a, wid))]
    assert reasons == [(500.0, "created"), (800.0, "update"), (800.0, "check-in")]


def test_last_checked_only_moves_when_the_balance_is_confirmed(api, as_a):
    w = make(api, as_a)
    time.sleep(0.05)
    renamed = api.patch(f"/api/wallets/{w['id']}", json={"name": "Renamed wallet"}, headers=as_a).json()
    assert renamed["lastCheckedAt"] == w["lastCheckedAt"]
    time.sleep(0.05)
    checked = api.patch(f"/api/wallets/{w['id']}", json={"balance": 500}, headers=as_a).json()
    assert checked["lastCheckedAt"] > w["lastCheckedAt"]


def test_trend_is_capped_at_twelve_points_oldest_first(api, as_a):
    w = make(api, as_a, balance=0)
    for value in range(1, 16):
        api.patch(f"/api/wallets/{w['id']}", json={"balance": value * 10}, headers=as_a)
    listed = api.get("/api/wallets", headers=as_a).json()[0]
    assert listed["trend"] == [float(v * 10) for v in range(4, 16)]
    assert len(history(api, as_a, w["id"])) == 16


def test_history_and_updates_are_private_to_the_owner(api, as_a, as_b):
    w = make(api, as_a)
    assert api.get(f"/api/wallets/{w['id']}/history", headers=as_b).status_code == 404
    assert api.patch(f"/api/wallets/{w['id']}", json={"balance": 1}, headers=as_b).status_code == 404
    assert api.get("/api/wallets", headers=as_b).json() == []
    assert len(history(api, as_a, w["id"])) == 1


def test_deleting_an_account_removes_its_history(api, as_a, db_engine):
    w = make(api, as_a)
    api.patch(f"/api/wallets/{w['id']}", json={"balance": 9}, headers=as_a)
    assert api.delete(f"/api/wallets/{w['id']}", headers=as_a).status_code == 204
    with db_engine.connect() as c:
        assert c.execute(text("SELECT count(*) FROM public.wallet_balance_history WHERE wallet_id=:i"), {"i": w["id"]}).scalar_one() == 0
    assert api.get(f"/api/wallets/{w['id']}/history", headers=as_a).status_code == 404


def test_tracking_never_touches_the_savings_ledger(api, as_a):
    make(api, as_a, balance=99999)
    api.post("/api/wallets", json={**BODY, "kind": "atm", "source": "card", "card_last4": "1111", "balance": 5000}, headers=as_a)
    d = api.get("/api/dashboard", headers=as_a).json()
    assert d["balance"] == 0 and d["transaction_count"] == 0


def test_getting_started_guide_can_be_hidden_and_persists(api, as_a, as_b):
    assert api.get("/api/profile", headers=as_a).json()["onboarding_dismissed"] is False
    r = api.patch("/api/profile", json={"onboarding_dismissed": True}, headers=as_a)
    assert r.status_code == 200 and r.json()["onboarding_dismissed"] is True
    assert api.get("/api/profile", headers=as_a).json()["onboarding_dismissed"] is True
    assert api.get("/api/profile", headers=as_b).json()["onboarding_dismissed"] is False
    assert api.patch("/api/profile", json={"onboarding_dismissed": False}, headers=as_a).json()["onboarding_dismissed"] is False
    assert api.patch("/api/profile", json={"onboarding_dismissed": "maybe"}, headers=as_a).status_code == 422
