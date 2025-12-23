"""FastAPI application factory for the explanation service."""

from __future__ import annotations

import asyncio
import contextlib
import logging

import redis.asyncio as redis
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from qdrant_client import QdrantClient

from .api.routes import router as explanations_router
from .clients.yandex_gpt import YandexGPTClient
from .config import get_settings
from .jobs.scheduler import MaintenanceScheduler
from .middleware import CircuitBreakerMiddleware, RateLimitMiddleware
from .services.explanations import ExplanationService
from .services.metrics import register_metrics
from .utils.logging import configure_logging
from .workers.embedding_worker import EmbeddingWorker


def create_app() -> FastAPI:
    """Factory used by uvicorn entrypoint."""

    settings = get_settings()
    configure_logging(settings.log_level)

    app = FastAPI(
        title="Explanation Builder API",
        version="0.1.0",
        docs_url="/docs" if settings.app_env != "prod" else None,
        redoc_url=None,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(RateLimitMiddleware, limit=120, window_seconds=60)
    app.add_middleware(CircuitBreakerMiddleware, failure_threshold=4, recovery_time=20)

    register_metrics(app)
    app.include_router(explanations_router, prefix="/v1")

    @app.get("/health")
    async def health_check() -> dict[str, str]:
        return {"status": "ok"}

    @app.on_event("startup")
    async def on_startup() -> None:
        logging.getLogger(__name__).info("Starting explanation service")
        mongo_client: AsyncIOMotorClient = AsyncIOMotorClient(settings.mongodb_uri)
        redis_client = redis.from_url(settings.redis_url, decode_responses=True)
        qdrant_client = QdrantClient(
            url=str(settings.qdrant_url), api_key=settings.qdrant_api_key
        )

        yandex_client = None
        if settings.yandexgpt_api_key and settings.yandexgpt_folder_id:
            yandex_client = YandexGPTClient(settings)

        app.state.settings = settings
        app.state.mongo_client = mongo_client
        app.state.mongo_db = mongo_client[settings.mongodb_db]
        app.state.redis = redis_client
        app.state.qdrant = qdrant_client
        app.state.yandex_client = yandex_client
        worker = EmbeddingWorker(
            settings, app.state.mongo_db, redis_client, qdrant_client
        )
        app.state.embedding_worker = worker
        app.state.embedding_task = asyncio.create_task(worker.run_forever())
        scheduler = MaintenanceScheduler(settings, qdrant_client, redis_client)
        scheduler.start()
        app.state.maintenance_scheduler = scheduler
        app.state.explanation_service = ExplanationService(
            settings=settings,
            mongo=app.state.mongo_db,
            redis=redis_client,
            qdrant=qdrant_client,
            yandex_client=yandex_client,
        )

    @app.on_event("shutdown")
    async def on_shutdown() -> None:
        logging.getLogger(__name__).info("Stopping explanation service")
        mongo_client: AsyncIOMotorClient = app.state.mongo_client
        mongo_client.close()

        redis_client: redis.Redis = app.state.redis
        await redis_client.close()

        qdrant_client: QdrantClient = app.state.qdrant
        close_fn = getattr(qdrant_client, "close", None)
        if callable(close_fn):
            close_fn()

        yandex_client: YandexGPTClient | None = app.state.yandex_client
        if yandex_client:
            await yandex_client.close()

        worker_task: asyncio.Task | None = app.state.embedding_task
        if worker_task:
            worker_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await worker_task

        scheduler: MaintenanceScheduler | None = app.state.maintenance_scheduler
        if scheduler:
            scheduler.shutdown()

    return app
