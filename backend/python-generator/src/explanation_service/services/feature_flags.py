"""Feature flag helpers backed by MongoDB + Redis cache."""

from __future__ import annotations

from motor.motor_asyncio import AsyncIOMotorDatabase
from redis.asyncio import Redis


class FeatureFlagService:
    """Simple flag reader with Redis cache."""

    def __init__(
        self,
        mongo: AsyncIOMotorDatabase,
        redis_client: Redis,
        ttl_seconds: int,
    ) -> None:
        self._collection = mongo["feature_flags"]
        self._redis = redis_client
        self._ttl = ttl_seconds

    def _key(self, flag_name: str) -> str:
        return f"feature_flag:{flag_name}"

    async def is_enabled(self, flag_name: str, default: bool = False) -> bool:
        cache_key = self._key(flag_name)
        cached = await self._redis.get(cache_key)
        if cached is not None:
            return cached == "1"

        doc = await self._collection.find_one({"flag_name": flag_name})
        value = bool(doc["enabled"]) if doc and "enabled" in doc else default
        await self._redis.setex(cache_key, self._ttl, "1" if value else "0")
        return value
