"""TEST-ONLY local stand-in for Supabase Auth (GoTrue), so the *real* React app and the *real* FastAPI
backend can be exercised end to end on a laptop or in CI without a Supabase project.

It is NOT Supabase and must never be used in production. What it does:

  POST /auth/v1/signup                    email + password registration (email confirmation is "off")
  POST /auth/v1/token?grant_type=password sign in (400 invalid_credentials on a wrong password)
  POST /auth/v1/token?grant_type=refresh_token
  POST /auth/v1/logout                    204
  GET  /auth/v1/user                      validates a bearer token (this is what FastAPI calls)
  GET  /auth/v1/authorize?provider=google|facebook&redirect_to=...
        SIMULATES the provider round trip: no real Google/Facebook is contacted. It immediately redirects
        back to `redirect_to#access_token=...` for a fixed demo person, exactly like the implicit OAuth flow.

Users are also inserted into the Postgres `auth.users` table (like real Supabase) so the database trigger
that creates `user_profiles` and the foreign keys behave the same as in production.

    DATABASE_URL=postgresql://... python tests/support/fake_gotrue.py 54321
"""
import base64
import json
import os
import secrets
import sys
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, quote, urlparse

import psycopg

DB_URL = os.getenv("DATABASE_URL", "")
USERS: dict[str, dict] = {}      # email -> {id, email, password, meta, provider}
TOKENS: dict[str, str] = {}      # access token -> email
REFRESH: dict[str, str] = {}     # refresh token -> email
TTL = 3600

SOCIAL = {
    "google": {"email": "maria.santos.google@example.test", "full_name": "Maria Santos", "avatar": ""},
    "facebook": {"email": "juan.delacruz.fb@example.test", "full_name": "Juan dela Cruz", "avatar": ""},
}


def b64(data: dict | bytes) -> str:
    raw = json.dumps(data, separators=(",", ":")).encode() if isinstance(data, dict) else data
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def make_jwt(user: dict) -> str:
    """Unsigned look-alike JWT. The backend never reads it; it asks /auth/v1/user instead (like real Supabase)."""
    now = int(time.time())
    payload = {"aud": "authenticated", "role": "authenticated", "sub": user["id"], "email": user["email"], "iat": now, "exp": now + TTL, "nonce": secrets.token_hex(4)}
    return f"{b64({'alg': 'HS256', 'typ': 'JWT'})}.{b64(payload)}.{b64(secrets.token_bytes(24))}"


def public_user(user: dict) -> dict:
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    return {
        "id": user["id"], "aud": "authenticated", "role": "authenticated", "email": user["email"], "email_confirmed_at": now,
        "app_metadata": {"provider": user["provider"], "providers": [user["provider"]]}, "user_metadata": user["meta"],
        "identities": [], "created_at": now, "updated_at": now,
    }


def issue_session(user: dict) -> dict:
    access, refresh = make_jwt(user), secrets.token_urlsafe(24)
    TOKENS[access], REFRESH[refresh] = user["email"], user["email"]
    return {"access_token": access, "token_type": "bearer", "expires_in": TTL, "expires_at": int(time.time()) + TTL, "refresh_token": refresh, "user": public_user(user)}


def upsert_user(email: str, password: str | None, meta: dict, provider: str) -> dict:
    user = USERS.get(email)
    if user is None:
        user = {"id": str(uuid.uuid4()), "email": email, "password": password, "meta": meta, "provider": provider}
        USERS[email] = user
        if DB_URL:  # mirror real Supabase: the user exists in auth.users, which fires the profile trigger
            with psycopg.connect(DB_URL, autocommit=True) as conn:
                conn.execute(
                    "INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data) VALUES (%s, %s, %s::jsonb, %s::jsonb) ON CONFLICT (id) DO NOTHING",
                    (user["id"], email, json.dumps(meta), json.dumps({"provider": provider, "providers": [provider]})),
                )
    return user


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "authorization, apikey, content-type, x-client-info, x-supabase-api-version")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")

    def _json(self, status: int, body: dict | None):
        data = json.dumps(body or {}).encode()
        self.send_response(status)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _body(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        try:
            return json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError:
            return {}

    def _bearer_user(self):
        token = (self.headers.get("Authorization") or "").removeprefix("Bearer ").strip()
        email = TOKENS.get(token)
        return USERS.get(email) if email else None

    def do_OPTIONS(self):  # noqa: N802
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):  # noqa: N802
        url = urlparse(self.path)
        query = parse_qs(url.query)
        if url.path == "/auth/v1/user":
            user = self._bearer_user()
            return self._json(200, public_user(user)) if user else self._json(401, {"msg": "invalid JWT", "code": 401})
        if url.path == "/auth/v1/authorize":
            provider = (query.get("provider") or [""])[0]
            redirect = (query.get("redirect_to") or [""])[0]
            person = SOCIAL.get(provider)
            if not person or not redirect:
                return self._json(400, {"msg": "unsupported provider or missing redirect_to"})
            user = upsert_user(person["email"], None, {"full_name": person["full_name"], "name": person["full_name"], "provider_id": f"sim-{provider}"}, provider)
            s = issue_session(user)
            fragment = f"access_token={quote(s['access_token'])}&expires_in={TTL}&expires_at={s['expires_at']}&refresh_token={quote(s['refresh_token'])}&token_type=bearer&provider_token=simulated&type=signup"
            self.send_response(302)
            self.send_header("Location", f"{redirect}#{fragment}")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return None
        return self._json(404, {"msg": "not found"})

    def do_POST(self):  # noqa: N802
        url = urlparse(self.path)
        query = parse_qs(url.query)
        body = self._body()
        if url.path == "/auth/v1/signup":
            email = (body.get("email") or "").strip().lower()
            if not email or len(body.get("password") or "") < 6:
                return self._json(422, {"code": 422, "error_code": "weak_password", "msg": "Password should be at least 6 characters."})
            if email in USERS and USERS[email]["provider"] == "email":
                return self._json(422, {"code": 422, "error_code": "user_already_exists", "msg": "User already registered"})
            user = upsert_user(email, body["password"], body.get("data") or {}, "email")
            return self._json(200, issue_session(user))
        if url.path == "/auth/v1/token":
            grant = (query.get("grant_type") or [""])[0]
            if grant == "password":
                user = USERS.get((body.get("email") or "").strip().lower())
                if not user or user["password"] != body.get("password"):
                    return self._json(400, {"code": 400, "error_code": "invalid_credentials", "msg": "Invalid login credentials"})
                return self._json(200, issue_session(user))
            if grant == "refresh_token":
                email = REFRESH.get(body.get("refresh_token", ""))
                return self._json(200, issue_session(USERS[email])) if email else self._json(400, {"msg": "Invalid Refresh Token"})
        if url.path == "/auth/v1/logout":
            token = (self.headers.get("Authorization") or "").removeprefix("Bearer ").strip()
            TOKENS.pop(token, None)
            self.send_response(204)
            self._cors()
            self.send_header("Content-Length", "0")
            self.end_headers()
            return None
        if url.path == "/auth/v1/recover":
            return self._json(200, {})
        return self._json(404, {"msg": "not found"})

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 54321
    print(f"fake GoTrue (TEST ONLY) listening on http://127.0.0.1:{port}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
