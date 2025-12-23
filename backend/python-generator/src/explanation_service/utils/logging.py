"""Utility helpers for structured logging."""

from __future__ import annotations

import logging
from datetime import datetime

from pythonjsonlogger.json import JsonFormatter


def configure_logging(level: str = "INFO") -> None:
    """Configure root logger with JSON formatter for consistency with other services."""

    log_level = getattr(logging, level.upper(), logging.INFO)
    logger = logging.getLogger()
    logger.setLevel(log_level)

    # Remove default handlers to avoid duplicate logs during tests
    while logger.handlers:
        logger.handlers.pop()

    handler = logging.StreamHandler()
    formatter = JsonFormatter(
        "%(asctime)s %(levelname)s %(name)s %(message)s %(pathname)s %(lineno)d",
        rename_fields={"levelname": "level"},
        timestamp=True,
        json_default=_json_default,
    )
    handler.setFormatter(formatter)
    logger.addHandler(handler)


def _json_default(value: object) -> str:
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)
