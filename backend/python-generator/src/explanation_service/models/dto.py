"""Pydantic DTOs shared by API handlers and workers."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class ExplanationRequest(BaseModel):
    """Incoming payload from Rust/Frontend clients."""

    task_id: str = Field(..., description="Unique task identifier from Rust API")
    topic_id: str | None = Field(
        default=None,
        description="Topic identifier, used for personalized messaging",
    )
    task_type: str | None = Field(
        default=None,
        description="Task template type (grammar, vocabulary, etc.)",
    )
    user_errors: list[str] = Field(
        default_factory=list,
        description="Latest mistakes detected by Rust scoring engine",
    )
    language_level: str | None = Field(
        default=None,
        description="CEFR-like user level (A1..C2)",
    )
    language: str = Field(
        default="ru",
        description="Language of the prompt and explanation",
    )
    request_id: str | None = Field(
        default=None,
        description="Idempotency key for tracing/logging",
    )


class ExplanationResponse(BaseModel):
    """DTO returned to Rust and frontend clients."""

    explanation: str
    rule_refs: list[str] = Field(default_factory=list)
    source: Literal["cache", "yandexgpt", "fallback"]
    took_ms: int = Field(
        default=0,
        description="Total time spent while generating the explanation",
    )
    generated_at: datetime = Field(default_factory=datetime.utcnow)
