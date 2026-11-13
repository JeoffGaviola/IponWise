"""Validate Supabase access tokens against Supabase Auth before trusting user identity."""
import os
import base64
import hashlib
import json
import time
from collections import OrderedDict
from typing import Any
import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import load_environment

load_environment()
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")
bearer_scheme = HTTPBearer(auto_error=False)
_client: httpx.AsyncClient | None = None
_cache: OrderedDict[str, tuple[float, dict[str, Any]]] = OrderedDict()
_CACHE_TTL = 30.0
_CACHE_LIMIT = 1024


def init_auth_client() -> None:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(timeout=8.0)


async def close_auth_client() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None


def _token_expiry(token: str) -> float | None:
    try:
        payload = token.split(".", 2)[1]
        payload += "=" * (-len(payload) % 4)
        value = json.loads(base64.urlsafe_b64decode(payload).decode("utf-8"))
        exp = value.get("exp")
        return float(exp) if exp is not None else None
    except (IndexError, ValueError, TypeError, json.JSONDecodeError):
        return None


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict[str, Any]:
    """Ask Supabase Auth to validate the bearer token; never trust a client-supplied user_id."""
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sign in to continue.", headers={"WWW-Authenticate": "Bearer"})
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        raise HTTPException(status_code=503, detail="Supabase Auth is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in backend/.env.")

    token = credentials.credentials
    cache_key = hashlib.sha256(token.encode("utf-8")).hexdigest()
    now = time.monotonic()
    cached = _cache.get(cache_key)
    if cached and cached[0] > now:
        _cache.move_to_end(cache_key)
        return cached[1]
    if cached:
        _cache.pop(cache_key, None)

    client = _client
    if client is None:
        client = httpx.AsyncClient(timeout=8.0)
        owns_client = True
    else:
        owns_client = False
    try:
        response = await client.get(
            f"{SUPABASE_URL}/auth/v1/user",
            headers={
                "Authorization": f"Bearer {token}",
                "apikey": SUPABASE_ANON_KEY,
            },
        )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail="Could not reach Supabase Auth. Please try again.") from exc
    finally:
        if owns_client:
            await client.aclose()

    if response.status_code != 200:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Your session is invalid or expired. Please sign in again.", headers={"WWW-Authenticate": "Bearer"})

    try:
        user = response.json()
        user_id = user.get("id")
        if not user_id:
            raise ValueError("Missing user ID")
    except (ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Supabase returned an invalid user session.")
    expiry = _token_expiry(token)
    ttl = _CACHE_TTL if expiry is None else min(_CACHE_TTL, max(0.0, expiry - time.time()))
    if ttl > 0:
        _cache[cache_key] = (time.monotonic() + ttl, user)
        _cache.move_to_end(cache_key)
        while len(_cache) > _CACHE_LIMIT:
            _cache.popitem(last=False)
    return user
