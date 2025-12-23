# Сервис пояснений

Python-сервис отвечает за генерацию контекстных пояснений с помощью RAG-пайплайна (MongoDB + Qdrant) и YandexGPT. Приложение разворачивается на FastAPI, предоставляет эндпоинт `/explanations`, использует кэш Redis, фоновые воркеры эмбеддингов и обслуживающие CLI-утилиты.

## Возможности
- Асинхронный FastAPI-сервер с метриками и middleware
- Кэш Redis (`explanation:cache:{task_id}`) и проверки feature flag
- Построение RAG-контекста (MongoDB + ближайшие соседи из Qdrant)
- Клиент YandexGPT с учётом таймаутов и fallback на шаблоны
- Redis Stream worker, поддерживающий эмбеддинги в Qdrant
- APScheduler-задачи для периодических снапшотов Qdrant и контроля очередей
- CLI на Typer (`scripts/rebuild_embeddings.py`) для полного переиндекса

Архитектурные детали описаны в `docs/explanation-service.md`.

> **Примечание:** fastText используется только как дополнительный fallback для эмбеддингов.
> По умолчанию сервис опирается на sentence-transformers и детерминированный hash-vector.
> Если fastText необходим локально, установите его вручную (`pip install fasttext==0.9.3`) и
> задайте `FASTTEXT_MODEL_PATH`. На платформах, где сборка fastText проблематична
> (например, Python 3.14 под Windows), зависимость можно опустить.
