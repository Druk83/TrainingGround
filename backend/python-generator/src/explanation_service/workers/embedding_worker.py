"""Redis Stream worker that keeps Qdrant embeddings in sync."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase
from qdrant_client import QdrantClient
from qdrant_client.http import models as rest
from redis.asyncio import Redis

from ..config import Settings
from ..services.embedding import EmbeddingGenerator
from ..services.metrics import STREAM_BACKLOG

LOGGER = logging.getLogger(__name__)


class EmbeddingWorker:
    """Reads change events from Redis Stream and updates Qdrant."""

    def __init__(
        self,
        settings: Settings,
        mongo: AsyncIOMotorDatabase,
        redis_client: Redis,
        qdrant: QdrantClient,
    ) -> None:
        self._settings = settings
        self._mongo = mongo
        self._redis = redis_client
        self._qdrant = qdrant
        self._embedder = EmbeddingGenerator(
            settings.embedding_model_name, settings.fasttext_model_path
        )

    async def ensure_group(self) -> None:
        try:
            await self._redis.xgroup_create(
                name=self._settings.redis_stream_name,
                groupname=self._settings.redis_stream_group,
                id="0",
                mkstream=True,
            )
            LOGGER.info(
                "Created Redis consumer group %s for stream %s",
                self._settings.redis_stream_group,
                self._settings.redis_stream_name,
            )
        except Exception as exc:
            if "BUSYGROUP" in str(exc):
                return
            raise

    async def run_forever(self) -> None:
        await self.ensure_group()
        while True:
            await self._update_lag_metric()
            messages = await self._redis.xreadgroup(
                groupname=self._settings.redis_stream_group,
                consumername=self._settings.redis_stream_consumer,
                streams={self._settings.redis_stream_name: ">"},
                count=10,
                block=2000,
            )
            if not messages:
                await asyncio.sleep(1)
                continue

            for _, entries in messages:
                for message_id, payload in entries:
                    try:
                        await self._process(payload)
                        await self._redis.xack(
                            self._settings.redis_stream_name,
                            self._settings.redis_stream_group,
                            message_id,
                        )
                    except Exception as exc:  # pragma: no cover
                        LOGGER.exception("Failed to process event %s: %s", message_id, exc)

    async def _process(self, payload: dict[str, Any]) -> None:
        collection = payload.get("collection")
        document_id = payload.get("document_id")
        action = payload.get("action")
        if collection != "rules" or not document_id:
            return

        if action in {"deleted"} or payload.get("status") == "deprecated":
            await self._delete_point(document_id)
            return

        rule = await self._mongo["rules"].find_one({"_id": document_id})
        if not rule:
            await self._delete_point(document_id)
            return
        if rule.get("status") == "deprecated":
            await self._delete_point(document_id)
            return

        text = f"{rule.get('name', '')}\n{rule.get('description', '')}"
        vector = await self._embedder.embed(text)
        point = rest.PointStruct(
            id=document_id,
            vector=vector,
            payload={
                "rule_id": document_id,
                "name": rule.get("name"),
                "description": rule.get("description"),
                "slug": rule.get("slug"),
                "difficulty": rule.get("metadata", {}).get("difficulty"),
            },
        )
        await asyncio.to_thread(
            self._qdrant.upsert,
            collection_name=self._settings.qdrant_rules_collection,
            points=[point],
        )
        LOGGER.debug("Updated embedding for rule %s", document_id)

    async def _delete_point(self, document_id: str) -> None:
        await asyncio.to_thread(
            self._qdrant.delete,
            collection_name=self._settings.qdrant_rules_collection,
            points_selector=rest.PointIdsList(points=[document_id]),
        )
        LOGGER.info("Removed embedding for rule %s", document_id)

    async def _update_lag_metric(self) -> None:
        length = await self._redis.xlen(self._settings.redis_stream_name)
        STREAM_BACKLOG.set(length)
