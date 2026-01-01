"""Pydantic models used by the Template Generator router."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field, field_validator

from ..config import get_settings


class TaskInstance(BaseModel):
    task_id: str
    text: str
    correct_answer: str
    options: list[str] | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class GenerateInstancesRequest(BaseModel):
    level_id: str
    count: int = Field(default=1, ge=1)
    user_id: str | None = None

    @field_validator("count")
    def clamp_count(cls, value: int) -> int:
        limit = get_settings().template_generation_limit
        return min(value, limit)


class GenerateInstancesResponse(BaseModel):
    instances: list[TaskInstance]
