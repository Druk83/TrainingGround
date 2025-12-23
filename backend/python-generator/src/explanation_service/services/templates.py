"""Fallback template repository."""

from __future__ import annotations

import logging
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase

LOGGER = logging.getLogger(__name__)


class TemplateRepository:
    """Reads templates/rules from Mongo to build deterministic explanations."""

    def __init__(self, mongo: AsyncIOMotorDatabase) -> None:
        self._tasks = mongo["tasks"]
        self._templates = mongo["templates"]
        self._rules = mongo["rules"]

    async def fallback_for_task(self, task_id: str) -> str:
        """Return static explanation text for the task."""

        task = await self._tasks.find_one({"_id": task_id})
        if not task:
            LOGGER.warning("Task %s not found, returning default fallback", task_id)
            return "Попробуйте перечитать условие и вспомнить правило из последнего упражнения."

        hints = task.get("hints")
        if hints:
            return hints[0].get("text", "Повторите правило в учебнике.")

        template_id = task.get("template_id")
        if not template_id:
            return "Сравните свой ответ с образцом и найдите расхождения."

        template = await self._templates.find_one({"_id": template_id})
        if not template:
            return "Сверьтесь с теорией по теме задания."

        rule_ids: list[str] = template.get("rule_ids", [])
        if not rule_ids:
            return "Внимательно перечитайте формулировку вопроса."

        cursor = self._rules.find({"_id": {"$in": rule_ids}})
        rules: list[dict[str, Any]] = await cursor.to_list(length=len(rule_ids))

        if not rules:
            return "Следуйте основному правилу, изученному ранее."

        chunks = [
            f"• {rule.get('name')}: {rule.get('description', 'нет описания')}"
            for rule in rules
        ]
        return "Напоминание по правилу:\n" + "\n".join(chunks)
