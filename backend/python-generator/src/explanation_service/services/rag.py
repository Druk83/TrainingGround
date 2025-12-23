"""RAG pipeline orchestrating Mongo context and Qdrant vector search."""

from __future__ import annotations

import logging
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase
from qdrant_client import QdrantClient

from ..config import Settings
from ..models.dto import ExplanationRequest
from .embedding import EmbeddingGenerator
from .morphology import MorphologyAnalyzer

LOGGER = logging.getLogger(__name__)


class RAGPipeline:
    """Builds prompts for YandexGPT using Mongo/Qdrant context."""

    def __init__(
        self,
        settings: Settings,
        mongo: AsyncIOMotorDatabase,
        qdrant: QdrantClient,
        embedder: EmbeddingGenerator,
        morphology: MorphologyAnalyzer,
    ) -> None:
        self._settings = settings
        self._mongo = mongo
        self._qdrant: Any = qdrant  # QdrantClient search method not typed in stubs
        self._embedder = embedder
        self._morph = morphology

        self._tasks = mongo["tasks"]
        self._templates = mongo["templates"]
        self._levels = mongo["levels"]
        self._topics = mongo["topics"]
        self._rules = mongo["rules"]

    async def build_prompt(self, payload: ExplanationRequest) -> tuple[str, list[str]]:
        task = await self._tasks.find_one({"_id": payload.task_id})
        if not task:
            raise ValueError(f"Task {payload.task_id} not found")

        template = None
        topic_name = "неизвестная тема"
        if template_id := task.get("template_id"):
            template = await self._templates.find_one({"_id": template_id})
            if template:
                level = await self._levels.find_one({"_id": template.get("level_id")})
                if level:
                    topic = await self._topics.find_one({"_id": level.get("topic_id")})
                    if topic:
                        topic_name = topic.get("name", topic_name)

        normalized_errors = await self._morph.normalize_errors(payload.user_errors)
        query_text = self._compose_query(task, normalized_errors)
        reference_chunks, rule_refs = await self._search_rules(query_text, template)

        context_lines = "\n".join(reference_chunks) if reference_chunks else "Нет контекста."

        prompt = (
            f"Тема: {topic_name}\n"
            f"Уровень ученика: {payload.language_level or 'не указан'}\n"
            f"Тип задания: {payload.task_type or 'неизвестен'}\n"
            f"Ошибки ученика: {', '.join(normalized_errors) or 'не зафиксированы'}\n\n"
            f"Контекст правил:\n{context_lines}\n\n"
            f"Текст задания: {task.get('content', {}).get('sentence', 'неизвестно')}\n"
            "Сформулируй объяснение, упоминая связанные правила и примеры.\n"
            "Возвращай ответ на русском языке, максимум 3 абзаца."
        )

        return prompt, rule_refs

    def _compose_query(self, task: dict, normalized_errors: list[str]) -> str:
        content = task.get("content", {})
        sentence = content.get("sentence") or content.get("text") or ""
        return f"{sentence}\nОшибки: {'; '.join(normalized_errors)}"

    async def _search_rules(
        self, query_text: str, template: dict | None
    ) -> tuple[list[str], list[str]]:
        try:
            vector = await self._embedder.embed(query_text)
            hits = self._qdrant.search(
                collection_name=self._settings.qdrant_rules_collection,
                query_vector=vector,
                limit=5,
                with_payload=True,
            )
        except Exception as exc:  # pragma: no cover - depends on Qdrant
            LOGGER.warning("Qdrant search failed: %s", exc)
            local_refs = template.get("rule_ids", []) if template else []
            return (await self._local_rule_context(template), local_refs)

        chunks: list[str] = []
        refs: list[str] = []
        for hit in hits:
            payload = hit.payload or {}
            rule_id = payload.get("rule_id")
            if rule_id:
                refs.append(rule_id)
            description = payload.get("description") or payload.get("summary")
            if description:
                chunks.append(
                    f"{payload.get('name') or payload.get('slug') or rule_id}: {description}"
                )

        if not chunks:
            local_refs = template.get("rule_ids", []) if template else []
            return (await self._local_rule_context(template), local_refs or refs)

        return chunks, refs

    async def _local_rule_context(self, template: dict | None) -> list[str]:
        if not template:
            return []
        rule_ids = template.get("rule_ids", [])
        if not rule_ids:
            return []
        cursor = self._rules.find({"_id": {"$in": rule_ids}})
        rules = await cursor.to_list(length=len(rule_ids))
        return [
            f"{rule.get('name', rule.get('_id', 'правило'))}: {rule.get('description', 'нет описания')}"
            for rule in rules
        ]
