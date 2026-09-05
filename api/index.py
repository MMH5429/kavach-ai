"""Vercel serverless entrypoint for the Kavach FastAPI backend.

The deployed bundle keeps the repo layout (api/ alongside backend/), so we add
backend/ to the import path and re-export the ASGI app. Vercel's Python runtime
detects the module-level `app` and serves it.

Environment variables (GEMINI_API_KEY) come from the Vercel project settings;
app.main's load_dotenv() is a harmless no-op here.
"""
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.main import app  # noqa: E402  (path must be set before this import)

__all__ = ["app"]
