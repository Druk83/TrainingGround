"""Tests for the Template Generator components."""

from __future__ import annotations

import sys
from pathlib import Path
from typing import cast

import pytest
from fakeredis.aioredis import FakeRedis
from fastapi import HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

ROOT_DIR = Path(__file__).resolve().parents[3]  # Go up 3 levels to reach b:\MishaGame
SRC_DIR = ROOT_DIR / "backend" / "python-generator" / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.append(str(SRC_DIR))

from explanation_service.config import get_settings  # noqa: E402
from explanation_service.template_generator.dto import (  # noqa: E402
    GenerateInstancesRequest,
)
from explanation_service.template_generator.engine import (  # noqa: E402
    TemplateContext,
    TemplateEngine,
)
from explanation_service.template_generator.repository import (  # noqa: E402
    ExampleSentenceBank,
    TemplateDescriptor,
    TemplateRepository,
    WordBank,
)
from explanation_service.template_generator.service import (  # noqa: E402
    TemplateGeneratorService,
)


class StaticWordBank(WordBank):
    def sample(self, pos: str) -> str:  # pragma: no cover - simple stub
        return "ученик"


class StaticExampleBank(ExampleSentenceBank):
    def sentence(self) -> str:  # pragma: no cover - simple stub
        return "Пример предложения."


class StubRepository(TemplateRepository):
    def __init__(self, templates: list[TemplateDescriptor]) -> None:
        self._templates = templates

    async def list_ready_templates(self, level_id: str) -> list[TemplateDescriptor]:
        return [tpl for tpl in self._templates if tpl.level_id == level_id]


def test_template_engine_inflects_word() -> None:
    engine = TemplateEngine(StaticWordBank(), StaticExampleBank())
    context = TemplateContext(
        template_id="tmpl-1",
        level_id="lvl",
        params={},
        metadata={},
    )

    rendered = engine.render("Найди {{word:noun:genitive}}.", context)

    assert rendered.strip() == "Найди ученика."


def test_template_engine_all_cases_singular() -> None:
    """Проверка всех падежей существительного в единственном числе."""
    engine = TemplateEngine(StaticWordBank(), StaticExampleBank())
    context = TemplateContext(
        template_id="tmpl-1",
        level_id="lvl",
        params={},
        metadata={},
    )

    cases_expected = [
        ("nominative", "ученик"),
        ("genitive", "ученика"),
        ("dative", "ученику"),
        ("accusative", "ученика"),
        ("instrumental", "учеником"),
        ("prepositional", "ученике"),
    ]

    for case, expected in cases_expected:
        template = f"Проверка: {{{{word:noun:{case}:singular}}}}."
        rendered = engine.render(template, context)
        assert rendered.strip() == f"Проверка: {expected}."


def test_template_engine_all_cases_plural() -> None:
    """Проверка всех падежей существительного во множественном числе."""
    engine = TemplateEngine(StaticWordBank(), StaticExampleBank())
    context = TemplateContext(
        template_id="tmpl-1",
        level_id="lvl",
        params={},
        metadata={},
    )

    cases_expected = [
        ("nominative", "ученики"),
        ("genitive", "учеников"),
        ("dative", "ученикам"),
        ("accusative", "учеников"),
        ("instrumental", "учениками"),
        ("prepositional", "учениках"),
    ]

    for case, expected in cases_expected:
        template = f"Проверка: {{{{word:noun:{case}:plural}}}}."
        rendered = engine.render(template, context)
        assert rendered.strip() == f"Проверка: {expected}."


def test_template_engine_case_aliases() -> None:
    """Проверка алиасов падежей (nom, gen, dat, acc, ins, loc)."""
    engine = TemplateEngine(StaticWordBank(), StaticExampleBank())
    context = TemplateContext(
        template_id="tmpl-1",
        level_id="lvl",
        params={},
        metadata={},
    )

    aliases_expected = [
        ("nom", "ученик"),
        ("gen", "ученика"),
        ("dat", "ученику"),
        ("acc", "ученика"),
        ("ins", "учеником"),
        ("loc", "ученике"),
    ]

    for alias, expected in aliases_expected:
        template = f"{{{{word:noun:{alias}:sg}}}}."
        rendered = engine.render(template, context)
        assert rendered.strip() == f"{expected}."


def test_template_engine_number_parameter() -> None:
    """Проверка параметра number для генерации случайных чисел."""
    engine = TemplateEngine(StaticWordBank(), StaticExampleBank())
    context = TemplateContext(
        template_id="tmpl-1",
        level_id="lvl",
        params={},
        metadata={},
    )

    template = "Число: {{number:5:10}}."
    rendered = engine.render(template, context)

    import re

    match = re.search(r"Число: (\d+)\.", rendered)
    assert match
    number = int(match.group(1))
    assert 5 <= number <= 10


def test_template_engine_example_parameter() -> None:
    """Проверка параметра example для вставки предложений."""
    engine = TemplateEngine(StaticWordBank(), StaticExampleBank())
    context = TemplateContext(
        template_id="tmpl-1",
        level_id="lvl",
        params={},
        metadata={},
    )

    template = "Пример: {{example}}"
    rendered = engine.render(template, context)

    assert rendered.strip() == "Пример: Пример предложения."


def test_template_engine_option_parameter() -> None:
    """Проверка параметра option для выбора из вариантов."""
    engine = TemplateEngine(StaticWordBank(), StaticExampleBank())
    context = TemplateContext(
        template_id="tmpl-1",
        level_id="lvl",
        params={"options": ["вариант1", "вариант2", "вариант3"]},
        metadata={},
    )

    template = "Выбран: {{option}}."
    rendered = engine.render(template, context)

    assert rendered in [
        "Выбран: вариант1.",
        "Выбран: вариант2.",
        "Выбран: вариант3.",
    ]


@pytest.mark.asyncio
async def test_template_generator_respects_deduplication() -> None:
    redis = FakeRedis()
    descriptor = TemplateDescriptor(
        template_id="template-1",
        level_id="level-1",
        content="Найди {{word:noun:genitive}}.",
        params={"options": ["A", "B"]},
        metadata={"correct_answer": "ученика"},
    )

    service = TemplateGeneratorService(
        settings=get_settings(),
        mongo=cast(AsyncIOMotorDatabase, object()),
        redis=redis,
        repository=StubRepository([descriptor]),
        word_bank=StaticWordBank(),
        example_bank=StaticExampleBank(),
    )

    request = GenerateInstancesRequest(level_id="level-1", count=1, user_id="student-1")
    first = await service.generate_instances(request)

    assert len(first.instances) == 1
    assert first.instances[0].metadata["template_id"] == "template-1"

    cache_key = f"template:instances:{descriptor.template_id}"
    cached = await redis.get(cache_key)
    assert cached

    with pytest.raises(HTTPException) as excinfo:
        await service.generate_instances(
            GenerateInstancesRequest(level_id="level-1", count=1, user_id="student-1")
        )

    assert excinfo.value.status_code == 409
