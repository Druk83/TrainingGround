"""High-level ExplanationService façade used by the FastAPI route."""

from __future__ import annotations

import logging
import time
from typing import Literal

import httpx
from motor.motor_asyncio import AsyncIOMotorDatabase
from qdrant_client import QdrantClient
from redis.asyncio import Redis

from ..clients.yandex_gpt import YandexGPTClient
from ..config import Settings
from ..models.dto import ExplanationRequest, ExplanationResponse
from .cache import ExplanationCache
from .embedding import EmbeddingGenerator
from .feature_flags import FeatureFlagService
from .metrics import CACHE_HITS, CACHE_MISSES, YANDEXGPT_ERRORS
from .morphology import MorphologyAnalyzer
from .rag import RAGPipeline
from .templates import TemplateRepository

LOGGER = logging.getLogger(__name__)


class ExplanationService:
    """Coordinates cache lookups, RAG pipeline, YandexGPT and fallbacks."""

    def __init__(
        self,
        settings: Settings,
        mongo: AsyncIOMotorDatabase,
        redis: Redis,
        qdrant: QdrantClient,
        yandex_client: YandexGPTClient | None,
    ) -> None:
        self._settings = settings
        self._cache = ExplanationCache(redis, settings.explanation_cache_ttl_seconds)
        self._feature_flags = FeatureFlagService(
            mongo, redis, settings.feature_flag_cache_ttl_seconds
        )
        self._templates = TemplateRepository(mongo)
        self._embedder = EmbeddingGenerator(
            settings.embedding_model_name, settings.fasttext_model_path
        )
        self._morph = MorphologyAnalyzer()
        self._rag = RAGPipeline(settings, mongo, qdrant, self._embedder, self._morph)
        self._yandex = yandex_client
        self._mongo = mongo

    async def handle_request(self, payload: ExplanationRequest) -> ExplanationResponse:
        start = time.perf_counter()

        if self._settings.cache_enabled:
            cached = await self._cache.get(payload)
            if cached:
                CACHE_HITS.inc()
                return cached
            CACHE_MISSES.inc()

        try:
            prompt, rule_refs = await self._rag.build_prompt(payload)
        except ValueError as exc:
            LOGGER.warning("Prompt building failed: %s", exc)
            explanation = await self._templates.fallback_for_task(payload.task_id)
            return self._finalize_response(
                payload,
                explanation,
                rule_refs=[],
                source="fallback",
                start_time=start,
            )

        explanation_text: str | None = None
        source: Literal["cache", "yandexgpt", "fallback"] = "fallback"
        use_llm = await self._feature_flags.is_enabled(
            "explanation_yandexgpt_enabled",
            self._settings.explanation_yandexgpt_enabled,
        )

        if use_llm and self._yandex:
            try:
                explanation_text = await self._yandex.generate(prompt)
                source = "yandexgpt"
            except (httpx.TimeoutException, httpx.HTTPStatusError, RuntimeError) as exc:
                YANDEXGPT_ERRORS.labels(
                    reason=exc.__class__.__name__
                ).inc()  # pragma: no cover - depends on network
                LOGGER.warning("YandexGPT failed, falling back: %s", exc)

        if not explanation_text:
            explanation_text = await self._templates.fallback_for_task(payload.task_id)
            if not rule_refs:
                rule_refs = await self._derive_rule_refs(payload.task_id)
            source = "fallback"

        response = self._finalize_response(
            payload,
            explanation_text,
            rule_refs=rule_refs,
            source=source,
            start_time=start,
        )

        if self._settings.cache_enabled:
            await self._cache.set(payload, response)

        return response

    async def _derive_rule_refs(self, task_id: str) -> list[str]:
        task = await self._mongo["tasks"].find_one({"_id": task_id})
        if not task:
            return []
        template_id = task.get("template_id")
        if not template_id:
            return []
        template = await self._mongo["templates"].find_one({"_id": template_id})
        if not template:
            return []
        return template.get("rule_ids", [])

    def _finalize_response(
        self,
        payload: ExplanationRequest,
        explanation: str,
        rule_refs: list[str],
        source: Literal["cache", "yandexgpt", "fallback"],
        start_time: float,
    ) -> ExplanationResponse:
        elapsed = int((time.perf_counter() - start_time) * 1000)
        response = ExplanationResponse(
            explanation=explanation,
            rule_refs=rule_refs,
            source=source,
            took_ms=elapsed,
        )
        LOGGER.info(
            "Explanation ready",
            extra={
                "task_id": payload.task_id,
                "source": source,
                "rule_refs": rule_refs,
                "took_ms": elapsed,
            },
        )
        return response
