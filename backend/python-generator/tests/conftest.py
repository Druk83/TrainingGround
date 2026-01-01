"""Pytest configuration and fixtures."""

from __future__ import annotations

from pathlib import Path

from dotenv import load_dotenv

# Load .env before any imports that use settings
ROOT_DIR = Path(__file__).resolve().parents[2]
ENV_FILE = ROOT_DIR / ".env"
if ENV_FILE.exists():
    load_dotenv(ENV_FILE)
