"""Redis cache helper for explanations."""

from __future__ import annotations

import hashlib
import json

from redis.asyncio import Redis

from ..models.dto import ExplanationRequest, ExplanationResponse


class ExplanationCache:
    """Wraps Redis access and stores responses alongside request fingerprint."""

    def __init__(self, redis_client: Redis, ttl_seconds: int) -> None:
        self._redis = redis_client
        self._ttl = ttl_seconds

    @staticmethod
    def _fingerprint(payload: ExplanationRequest) -> str:
        serializable = payload.model_dump(
            include={
                "task_id",
                "topic_id",
                "task_type",
                "user_errors",
                "language_level",
                "language",
            }
        )
        encoded = json.dumps(serializable, sort_keys=True, ensure_ascii=False).encode(
            "utf-8"
        )
        return hashlib.sha256(encoded).hexdigest()

    def _key(self, task_id: str) -> str:
        return f"explanation:cache:{task_id}"

    async def get(self, payload: ExplanationRequest) -> ExplanationResponse | None:
        key = self._key(payload.task_id)
        raw = await self._redis.get(key)
        if not raw:
            return None

        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            return ExplanationResponse(
                explanation=raw,
                rule_refs=[],
                source="cache",
                took_ms=0,
            )
        if data.get("fingerprint") != self._fingerprint(payload):
            return None

        return ExplanationResponse(**data["response"])

    async def set(
        self,
        payload: ExplanationRequest,
        response: ExplanationResponse,
    ) -> None:
        key = self._key(payload.task_id)
        document = {
            "fingerprint": self._fingerprint(payload),
            "response": response.model_dump(mode="json"),
        }
        await self._redis.setex(
            key, self._ttl, json.dumps(document, ensure_ascii=False)
        )
