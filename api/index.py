"""Vercel entrypoint for the IponWise FastAPI application."""

from backend.app.main import app

__all__ = ["app"]
