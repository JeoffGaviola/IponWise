"""TEST-ONLY stand-in for Supabase Auth's `GET /auth/v1/user`, so the real FastAPI token-verification
code path can run locally without a Supabase project. It is NOT Supabase: it just maps fixed test
tokens to fixed users and returns 401 for everything else.

    python tests/support/stub_supabase_auth.py 54399
"""
import json
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

USERS = {
    "token-a": {"id": "11111111-1111-4111-8111-111111111111", "email": "a@example.test", "user_metadata": {"full_name": "Alice A"}},
    "token-b": {"id": "22222222-2222-4222-8222-222222222222", "email": "b@example.test", "user_metadata": {"full_name": "Bob B"}},
}


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802
        token = (self.headers.get("Authorization") or "").removeprefix("Bearer ").strip()
        user = USERS.get(token) if self.path == "/auth/v1/user" else None
        body = json.dumps(user or {"msg": "invalid JWT"}).encode()
        self.send_response(200 if user else 401)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    HTTPServer(("127.0.0.1", int(sys.argv[1]) if len(sys.argv) > 1 else 54399), Handler).serve_forever()
