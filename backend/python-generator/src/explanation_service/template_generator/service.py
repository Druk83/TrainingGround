"""Business logic for generating task instances from templates."""

from __future__ import annotations

import json
import random
import uuid
from collections.abc import Iterable
from typing import Any

from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from redis.asyncio.client import Redis

from ..config import Settings
from .dto import GenerateInstancesRequest, GenerateInstancesResponse, TaskInstance
from .engine import TemplateContext, TemplateEngine
from .repository import (
    ExampleSentenceBank,
    TemplateDescriptor,
    TemplateRepository,
    WordBank,
)


class TemplateGeneratorService:
    def __init__(
        self,
        settings: Settings,
        mongo: AsyncIOMotorDatabase,
        redis: Redis | None,
        repository: TemplateRepository | None = None,
        word_bank: WordBank | None = None,
        example_bank: ExampleSentenceBank | None = None,
    ) -> None:
        self._settings = settings
        self._repository = repository or TemplateRepository(mongo["templates"])
        self._engine = TemplateEngine(
            word_bank or WordBank(), example_bank or ExampleSentenceBank()
        )
        self._redis = redis
        self._random = random.Random()

    async def generate_instances(
        self, payload: GenerateInstancesRequest
    ) -> GenerateInstancesResponse:
        try:
            templates = await self._repository.list_ready_templates(payload.level_id)
        except ValueError as error:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=str(error),
            ) from error
        if not templates:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No ready templates found for the requested level.",
            )

        instances: list[TaskInstance] = []
        seen_templates = await self._load_seen_templates(payload.user_id)
        candidates = templates.copy()
        self._random.shuffle(candidates)

        for template in candidates:
            if len(instances) >= payload.count:
                break
            if payload.user_id and template.template_id in seen_templates:
                continue
            instance = await self._build_instance(template, payload.user_id)
            instances.append(instance)
            seen_templates.add(template.template_id)

        if not instances:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Unable to generate new instances (all templates were already shown).",
            )

        return GenerateInstancesResponse(instances=instances)

    async def _build_instance(
        self, template: TemplateDescriptor, user_id: str | None
    ) -> TaskInstance:
        cache = await self._load_cached_instance(template.template_id)
        context = TemplateContext(
            template_id=template.template_id,
            level_id=template.level_id,
            params=template.params,
            metadata=template.metadata,
        )

        if cache:
            text = cache["text"]
            correct_answer = cache["correct_answer"]
            options = cache.get("options")
        else:
            text = self._engine.render(template.content, context)
            correct_answer = self._engine.render(
                str(template.metadata.get("correct_answer", text)), context
            )
            raw_options = template.params.get("options")
            options = None
            if isinstance(raw_options, Iterable) and not isinstance(raw_options, str):
                options = [str(option) for option in raw_options]
            await self._cache_instance(
                template.template_id, text, correct_answer, options
            )

        await self._remember_template(user_id, template.template_id)

        metadata = {
            **template.metadata,
            "template_id": template.template_id,
            "level_id": template.level_id,
        }

        return TaskInstance(
            task_id=str(uuid.uuid4()),
            text=text,
            correct_answer=correct_answer,
            options=options,
            metadata=metadata,
        )

    async def _load_seen_templates(self, user_id: str | None) -> set[str]:
        if not user_id or not self._redis:
            return set()
        key = f"seen_tasks:{user_id}"
        members = await self._redis.smembers(key)
        normalized: set[str] = set()
        for member in members or []:
            if isinstance(member, bytes):
                normalized.add(member.decode())
            else:
                normalized.add(member)
        return normalized

    async def _remember_template(self, user_id: str | None, template_id: str) -> None:
        if not user_id or not self._redis:
            return
        key = f"seen_tasks:{user_id}"
        await self._redis.sadd(key, template_id)
        await self._redis.expire(key, self._settings.template_seen_tasks_ttl_seconds)

    async def _load_cached_instance(self, template_id: str) -> dict[str, Any] | None:
        if not self._redis:
            return None
        cache_key = f"template:instances:{template_id}"
        raw = await self._redis.get(cache_key)
        if not raw:
            return None
        try:
            return json.loads(raw)
        except (TypeError, ValueError):
            return None

    async def _cache_instance(
        self,
        template_id: str,
        text: str,
        correct_answer: str,
        options: list[str] | None,
    ) -> None:
        if not self._redis:
            return
        payload: dict[str, Any] = {
            "text": text,
            "correct_answer": correct_answer,
        }
        if options is not None:
            payload["options"] = options
        cache_key = f"template:instances:{template_id}"
        await self._redis.setex(
            cache_key,
            self._settings.template_instance_cache_ttl_seconds,
            json.dumps(payload, ensure_ascii=False),
        )
