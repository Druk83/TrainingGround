"""Background scheduler that handles Qdrant snapshots and telemetry."""

from __future__ import annotations

import asyncio
import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from qdrant_client import QdrantClient
from redis.asyncio import Redis

from ..config import Settings
from ..services.metrics import STREAM_BACKLOG

LOGGER = logging.getLogger(__name__)


class MaintenanceScheduler:
    """Wraps AsyncIOScheduler to keep snapshots and metrics in sync."""

    def __init__(self, settings: Settings, qdrant: QdrantClient, redis_client: Redis) -> None:
        self._settings = settings
        self._qdrant = qdrant
        self._redis = redis_client
        self._scheduler = AsyncIOScheduler()

    def start(self) -> None:
        cron = CronTrigger.from_crontab(self._settings.snapshot_cron)
        self._scheduler.add_job(self._snapshot_job, cron)
        self._scheduler.add_job(self._lag_job, "interval", seconds=30)
        self._scheduler.start()
        LOGGER.info("Maintenance scheduler started with cron %s", self._settings.snapshot_cron)

    def shutdown(self) -> None:
        self._scheduler.shutdown(wait=False)

    async def _snapshot_job(self) -> None:
        LOGGER.info("Creating Qdrant snapshot for %s", self._settings.qdrant_rules_collection)
        await asyncio.to_thread(
            self._qdrant.create_snapshot,
            self._settings.qdrant_rules_collection,
            wait=False,
        )

    async def _lag_job(self) -> None:
        length = await self._redis.xlen(self._settings.redis_stream_name)
        STREAM_BACKLOG.set(length)
