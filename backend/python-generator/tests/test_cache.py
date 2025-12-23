from __future__ import annotations

import sys
from pathlib import Path

import pytest
from fakeredis.aioredis import FakeRedis

ROOT_DIR = Path(__file__).resolve().parents[2]
SRC_DIR = ROOT_DIR / "backend" / "python-generator" / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.append(str(SRC_DIR))

from explanation_service.models.dto import (  # type: ignore  # noqa: E402
    ExplanationRequest,
    ExplanationResponse,
)
from explanation_service.services.cache import ExplanationCache  # type: ignore  # noqa: E402


@pytest.mark.asyncio
async def test_cache_roundtrip() -> None:
    redis = FakeRedis()
    cache = ExplanationCache(redis, ttl_seconds=60)
    request = ExplanationRequest(
        task_id="task-1", topic_id="topic-1", user_errors=["ошибка"]
    )
    response = ExplanationResponse(
        explanation="hello", rule_refs=["r1"], source="yandexgpt", took_ms=10
    )

    await cache.set(request, response)
    cached = await cache.get(request)

    assert cached is not None
    assert cached.explanation == "hello"
    assert cached.rule_refs == ["r1"]


@pytest.mark.asyncio
async def test_cache_miss_on_different_payload() -> None:
    redis = FakeRedis()
    cache = ExplanationCache(redis, ttl_seconds=60)
    base_request = ExplanationRequest(task_id="task-1")
    response = ExplanationResponse(
        explanation="foo", rule_refs=[], source="fallback", took_ms=5
    )

    await cache.set(base_request, response)
    altered_request = ExplanationRequest(task_id="task-1", user_errors=["typo"])

    cached = await cache.get(altered_request)
    assert cached is None
