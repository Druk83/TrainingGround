"""Integration tests for Template Generator with real MongoDB and Redis."""

from __future__ import annotations

import sys
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
    """Подключение к MongoDB для интеграционных тестов."""
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
    """Подключение к Redis для интеграционных тестов (используем FakeRedis)."""
    client = FakeRedis(decode_responses=False)
    yield client
    await client.close()


@pytest.fixture
async def template_service(mongo_db, redis_client):
    """Template Generator Service с реальными зависимостями."""
    settings = get_settings()
    word_bank = MongoWordBank(mongo_db["word_forms"])
    example_bank = MongoExampleSentenceBank(mongo_db["example_sentences"])

    service = TemplateGeneratorService(
        settings=settings,
        mongo=mongo_db,
        redis=redis_client,
        word_bank=word_bank,
        example_bank=example_bank,
    )
    return service


@pytest.mark.asyncio
@pytest.mark.integration
async def test_generate_instances_with_real_mongodb(mongo_db, redis_client):
    """Интеграционный тест генерации экземпляров с реальной MongoDB."""
    settings = get_settings()

    # Подготовка: создаем 5 тестовых шаблонов
    templates_collection = mongo_db["templates"]
    test_level_id = "test_level_orthography"

    test_templates = [
        {
            "level_id": test_level_id,
            "rule_ids": [],
            "content": f"Найди {{{{word:noun:genitive}}}} в предложении {i}.",
            "params": {"options": ["А", "Б", "В", "Г"]},
            "metadata": {"correct_answer": "word"},
            "status": "ready",
            "version": 1,
            "active": True,
        }
        for i in range(5)
    ]

    # Очистка перед тестом
    await templates_collection.delete_many({"level_id": test_level_id})
    await templates_collection.insert_many(test_templates)

    try:
        # Создаем сервис
        word_bank = MongoWordBank(mongo_db["word_forms"])
        example_bank = MongoExampleSentenceBank(mongo_db["example_sentences"])

        service = TemplateGeneratorService(
            settings=settings,
            mongo=mongo_db,
            redis=redis_client,
            word_bank=word_bank,
            example_bank=example_bank,
        )

        # Генерируем экземпляры
        request = GenerateInstancesRequest(
            level_id=test_level_id,
            count=5,
            user_id="test_user_123",
        )

        response = await service.generate_instances(request)

        # Проверки
        assert len(response.instances) == 5
        for instance in response.instances:
            assert instance.text.startswith("Найди ")
            assert instance.metadata.get("template_id")

    finally:
        # Очистка после теста
        await templates_collection.delete_many({"level_id": test_level_id})


@pytest.mark.asyncio
@pytest.mark.integration
async def test_generate_100_instances_uniqueness(mongo_db, redis_client):
    """Тест генерации 100 экземпляров с проверкой уникальности."""
    settings = get_settings()

    templates_collection = mongo_db["templates"]
    test_level_id = "test_level_uniqueness"

    # Создаем несколько шаблонов для разнообразия
    test_templates = [
        {
            "level_id": test_level_id,
            "rule_ids": [],
            "content": f"Шаблон {i}: {{{{word:noun:nominative}}}} - это {{{{word:adjective:nominative}}}}.",
            "params": {},
            "metadata": {},
            "status": "ready",
            "version": 1,
            "active": True,
        }
        for i in range(10)
    ]

    await templates_collection.delete_many({"level_id": test_level_id})
    await templates_collection.insert_many(test_templates)

    try:
        word_bank = MongoWordBank(mongo_db["word_forms"])
        example_bank = MongoExampleSentenceBank(mongo_db["example_sentences"])

        service = TemplateGeneratorService(
            settings=settings,
            mongo=mongo_db,
            redis=redis_client,
            word_bank=word_bank,
            example_bank=example_bank,
        )

        # Генерируем 100 экземпляров партиями по 10 для разных пользователей
        # (каждый пользователь видит по 10 шаблонов)
        all_instances = []
        for batch in range(10):
            request = GenerateInstancesRequest(
                level_id=test_level_id,
                count=10,  # максимум 10 шаблонов на уровне
                user_id=f"test_user_batch_{batch}",
            )
            response = await service.generate_instances(request)
            all_instances.extend(response.instances)

        # Проверка: каждый пользователь должен получить 10 экземпляров
        # 10 батчей х 10 экземпляров = 100 всего
        assert (
            len(all_instances) == 100
        ), f"Expected 100 instances, got {len(all_instances)}"
        unique_texts = set(inst.text for inst in all_instances)

        # Должно быть минимум 10 уникальных вариантов (по одному на шаблон)
        assert (
            len(unique_texts) >= 10
        ), f"Only {len(unique_texts)} unique instances out of 100"

    finally:
        await templates_collection.delete_many({"level_id": test_level_id})


@pytest.mark.asyncio
@pytest.mark.integration
async def test_deduplication_across_requests(mongo_db, redis_client):
    """Тест дедупликации: один пользователь не должен видеть повторяющиеся шаблоны."""
    settings = get_settings()

    templates_collection = mongo_db["templates"]
    test_level_id = "test_level_dedup"
    test_user_id = "test_user_dedup_123"

    test_template = {
        "level_id": test_level_id,
        "rule_ids": [],
        "content": "Единственный шаблон: {{word:noun:genitive}}.",
        "params": {},
        "metadata": {},
        "status": "ready",
        "version": 1,
        "active": True,
    }

    await templates_collection.delete_many({"level_id": test_level_id})
    await templates_collection.insert_one(test_template)

    # Очистка Redis для этого пользователя
    await redis_client.delete(f"seen_tasks:{test_user_id}")

    try:
        word_bank = MongoWordBank(mongo_db["word_forms"])
        example_bank = MongoExampleSentenceBank(mongo_db["example_sentences"])

        service = TemplateGeneratorService(
            settings=settings,
            mongo=mongo_db,
            redis=redis_client,
            word_bank=word_bank,
            example_bank=example_bank,
        )

        # Первая генерация - должна успешно пройти
        request1 = GenerateInstancesRequest(
            level_id=test_level_id,
            count=1,
            user_id=test_user_id,
        )
        response1 = await service.generate_instances(request1)
        assert len(response1.instances) == 1

        # Вторая генерация для того же пользователя - должна вернуть ошибку 409
        # т.к. единственный шаблон уже был показан
        from fastapi import HTTPException

        request2 = GenerateInstancesRequest(
            level_id=test_level_id,
            count=1,
            user_id=test_user_id,
        )

        with pytest.raises(HTTPException) as exc_info:
            await service.generate_instances(request2)

        assert exc_info.value.status_code == 409

    finally:
        await templates_collection.delete_many({"level_id": test_level_id})
        await redis_client.delete(f"seen_tasks:{test_user_id}")


@pytest.mark.asyncio
@pytest.mark.integration
async def test_word_bank_loads_from_mongodb(mongo_db):
    """Проверка загрузки словоформ из MongoDB."""
    word_bank = MongoWordBank(mongo_db["word_forms"])

    # Проверяем что можем получить существительное
    noun = await word_bank.sample_async("noun")
    assert noun
    assert isinstance(noun, str)
    assert len(noun) > 0

    # Проверяем что можем получить глагол
    verb = await word_bank.sample_async("verb")
    assert verb
    assert isinstance(verb, str)

    # Проверяем кэширование
    noun2 = await word_bank.sample_async("noun")
    assert noun2  # Должно вернуться из кэша


@pytest.mark.asyncio
@pytest.mark.integration
async def test_example_bank_loads_from_mongodb(mongo_db):
    """Проверка загрузки примеров предложений из MongoDB."""
    example_bank = MongoExampleSentenceBank(mongo_db["example_sentences"])

    # Получаем предложение
    sentence = await example_bank.sentence_async()
    assert sentence
    assert isinstance(sentence, str)
    assert len(sentence) > 0

    # Проверяем кэширование
    sentence2 = await example_bank.sentence_async()
    assert sentence2
