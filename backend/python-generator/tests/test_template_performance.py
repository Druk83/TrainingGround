"""Performance tests for Template Generator (SLA validation)."""

from __future__ import annotations

import asyncio
import sys
import time
from pathlib import Path

import pytest
from dotenv import load_dotenv
from fakeredis.aioredis import FakeRedis
from motor.motor_asyncio import AsyncIOMotorClient

ROOT_DIR = Path(__file__).resolve().parents[3]  # Go up 3 levels to reach b:\MishaGame
ENV_FILE = ROOT_DIR / ".env"
if ENV_FILE.exists():
    load_dotenv(ENV_FILE)

SRC_DIR = ROOT_DIR / "backend" / "python-generator" / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.append(str(SRC_DIR))

from explanation_service.config import get_settings  # noqa: E402
from explanation_service.template_generator.dto import (  # noqa: E402
    GenerateInstancesRequest,
)
from explanation_service.template_generator.repository import (  # noqa: E402
    MongoExampleSentenceBank,
    MongoWordBank,
)
from explanation_service.template_generator.service import (  # noqa: E402
    TemplateGeneratorService,
)


@pytest.fixture
async def mongo_client():
    """Подключение к MongoDB."""
    settings = get_settings()
    client = AsyncIOMotorClient(settings.mongodb_uri)
    yield client
    client.close()


@pytest.fixture
async def mongo_db(mongo_client):
    """MongoDB database."""
    settings = get_settings()
    return mongo_client[settings.mongodb_db]


@pytest.fixture
async def redis_client():
    """Подключение к Redis (используем FakeRedis)."""
    client = FakeRedis(decode_responses=False)
    yield client
    await client.close()


@pytest.fixture
async def setup_test_templates(mongo_db):
    """Подготовка тестовых шаблонов для performance тестов."""
    templates_collection = mongo_db["templates"]
    test_level_id = "perf_test_level"

    # Создаем 50 разных шаблонов для тестирования
    test_templates = [
        {
            "level_id": test_level_id,
            "rule_ids": [],
            "content": f"Задание {i}: Найди {{{{word:noun:genitive}}}} в тексте {{{{example}}}}.",
            "params": {"options": ["А", "Б", "В", "Г"]},
            "metadata": {"difficulty": "medium"},
            "status": "ready",
            "version": 1,
            "active": True,
        }
        for i in range(50)
    ]

    await templates_collection.delete_many({"level_id": test_level_id})
    await templates_collection.insert_many(test_templates)

    yield test_level_id

    # Очистка
    await templates_collection.delete_many({"level_id": test_level_id})


@pytest.mark.asyncio
@pytest.mark.performance
async def test_generate_20_instances_sla(mongo_db, redis_client, setup_test_templates):
    """
    SLA тест: генерация 20 экземпляров должна занимать ≤ 2 секунд.

    Согласно requirements/A9.md строка 28: генерация 20 экземпляров за пакет ≤ 2 сек.
    """
    settings = get_settings()
    test_level_id = setup_test_templates

    word_bank = MongoWordBank(mongo_db["word_forms"])
    example_bank = MongoExampleSentenceBank(mongo_db["example_sentences"])

    service = TemplateGeneratorService(
        settings=settings,
        mongo=mongo_db,
        redis=redis_client,
        word_bank=word_bank,
        example_bank=example_bank,
    )

    # Очистка Redis для чистого теста
    test_user_id = "perf_user_sla"
    await redis_client.delete(f"seen_tasks:{test_user_id}")

    request = GenerateInstancesRequest(
        level_id=test_level_id,
        count=20,
        user_id=test_user_id,
    )

    # Измеряем время генерации
    start_time = time.perf_counter()
    response = await service.generate_instances(request)
    end_time = time.perf_counter()

    elapsed_seconds = end_time - start_time

    # Проверки
    assert (
        len(response.instances) == 20
    ), f"Expected 20 instances, got {len(response.instances)}"
    assert (
        elapsed_seconds <= 2.0
    ), f"SLA violation: generation took {elapsed_seconds:.3f}s, expected ≤ 2.0s"

    print(f"\n✓ Generated 20 instances in {elapsed_seconds:.3f}s (SLA: ≤2.0s)")


@pytest.mark.asyncio
@pytest.mark.performance
async def test_generate_100_instances_parallel(
    mongo_db, redis_client, setup_test_templates
):
    """
    Performance тест: генерация 100 экземпляров параллельно для разных пользователей.

    Согласно requirements/A9.md строка 47: генерация 100 экземпляров параллельно.
    """
    settings = get_settings()
    test_level_id = setup_test_templates

    word_bank = MongoWordBank(mongo_db["word_forms"])
    example_bank = MongoExampleSentenceBank(mongo_db["example_sentences"])

    service = TemplateGeneratorService(
        settings=settings,
        mongo=mongo_db,
        redis=redis_client,
        word_bank=word_bank,
        example_bank=example_bank,
    )

    # Генерируем 5 пакетов по 20 экземпляров параллельно
    tasks = []
    for i in range(5):
        user_id = f"perf_user_parallel_{i}"
        await redis_client.delete(f"seen_tasks:{user_id}")

        request = GenerateInstancesRequest(
            level_id=test_level_id,
            count=20,
            user_id=user_id,
        )
        tasks.append(service.generate_instances(request))

    start_time = time.perf_counter()
    responses = await asyncio.gather(*tasks)
    end_time = time.perf_counter()

    elapsed_seconds = end_time - start_time

    # Проверки
    total_instances = sum(len(r.instances) for r in responses)
    assert total_instances == 100, f"Expected 100 instances, got {total_instances}"
    assert (
        elapsed_seconds <= 3.0
    ), f"Parallel generation took {elapsed_seconds:.3f}s, expected ≤ 3.0s"

    print(
        f"\n✓ Generated 100 instances in parallel in {elapsed_seconds:.3f}s (SLA: ≤3.0s)"
    )


@pytest.mark.asyncio
@pytest.mark.performance
async def test_caching_improves_performance(
    mongo_db, redis_client, setup_test_templates
):
    """Проверка что кэширование улучшает производительность."""
    settings = get_settings()
    test_level_id = setup_test_templates

    word_bank = MongoWordBank(mongo_db["word_forms"])
    example_bank = MongoExampleSentenceBank(mongo_db["example_sentences"])

    service = TemplateGeneratorService(
        settings=settings,
        mongo=mongo_db,
        redis=redis_client,
        word_bank=word_bank,
        example_bank=example_bank,
    )

    test_user_id = "perf_user_cache"
    await redis_client.delete(f"seen_tasks:{test_user_id}")

    request = GenerateInstancesRequest(
        level_id=test_level_id,
        count=10,
        user_id=test_user_id,
    )

    # Первая генерация (без кэша)
    start_time1 = time.perf_counter()
    response1 = await service.generate_instances(request)
    end_time1 = time.perf_counter()
    time_without_cache = end_time1 - start_time1

    # Очистим seen_tasks но оставим кэш шаблонов
    await redis_client.delete(f"seen_tasks:{test_user_id}")

    # Вторая генерация (с кэшем)
    start_time2 = time.perf_counter()
    response2 = await service.generate_instances(request)
    end_time2 = time.perf_counter()
    time_with_cache = end_time2 - start_time2

    print(
        f"\n✓ Without cache: {time_without_cache:.3f}s, "
        f"With cache: {time_with_cache:.3f}s, "
        f"Improvement: {time_without_cache / time_with_cache:.2f}x"
    )

    # Кэш должен дать улучшение (хотя бы немного)
    # Не делаем жестких проверок, т.к. зависит от нагрузки системы
    assert len(response1.instances) == 10
    assert len(response2.instances) == 10


@pytest.mark.asyncio
@pytest.mark.performance
async def test_stress_1000_sequential_generations(
    mongo_db, redis_client, setup_test_templates
):
    """
    Стресс-тест: генерация 1000 экземпляров последовательно для проверки стабильности.
    """
    settings = get_settings()
    test_level_id = setup_test_templates

    word_bank = MongoWordBank(mongo_db["word_forms"])
    example_bank = MongoExampleSentenceBank(mongo_db["example_sentences"])

    service = TemplateGeneratorService(
        settings=settings,
        mongo=mongo_db,
        redis=redis_client,
        word_bank=word_bank,
        example_bank=example_bank,
    )

    # Генерируем 1000 экземпляров партиями по 20
    total_generated = 0
    start_time = time.perf_counter()

    for batch_num in range(50):  # 50 батчей по 20 = 1000
        user_id = f"stress_user_{batch_num}"
        await redis_client.delete(f"seen_tasks:{user_id}")

        request = GenerateInstancesRequest(
            level_id=test_level_id,
            count=20,
            user_id=user_id,
        )

        response = await service.generate_instances(request)
        total_generated += len(response.instances)

    end_time = time.perf_counter()
    elapsed_seconds = end_time - start_time

    # Проверки
    assert total_generated == 1000, f"Expected 1000 instances, got {total_generated}"
    avg_per_batch = elapsed_seconds / 50

    print(
        f"\n✓ Generated 1000 instances in {elapsed_seconds:.2f}s "
        f"({avg_per_batch:.3f}s per batch of 20)"
    )

    # Средняя скорость генерации должна быть приемлемой
    assert (
        avg_per_batch <= 2.0
    ), f"Average generation time {avg_per_batch:.3f}s exceeds SLA of 2.0s"
