"""Backend configuration loading."""

from pathlib import Path

from dotenv import load_dotenv


BACKEND_DIR = Path(__file__).resolve().parent.parent
ENV_FILE = BACKEND_DIR / ".env"


def load_environment() -> None:
    """Load backend/.env regardless of the process working directory."""
    load_dotenv(ENV_FILE)
