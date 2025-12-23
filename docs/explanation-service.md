# Explanation Service

Python microservice responsible for generating contextual explanations and keeping Qdrant embeddings in sync.

## API Contract
- **Endpoint:** POST /v1/explanations
- **Request body:**
  - 	ask_id (string, required)
  - 	opic_id, 	ask_type, language_level, language (optional metadata)
  - user_errors (array of strings with latest mistakes)
  - equest_id (idempotency/debug key)
- **Response body:**
  - explanation (string)
  - ule_refs (string array with rule ids)
  - source (cache | yandexgpt | fallback)
  - 	ook_ms (int)
  - generated_at (ISO timestamp)

Example:
`ash
curl -X POST http://localhost:8000/v1/explanations \
  -H 'Content-Type: application/json' \
  -d '{
        "task_id": "65f00a",
        "topic_id": "cases",
        "task_type": "grammar",
        "user_errors": ["родительный падеж"],
        "language_level": "B1"
      }'
`

## Sequence
`mermaid
sequenceDiagram
    participant Rust as Rust HintService
    participant Python as Explanation API
    participant Redis
    participant Qdrant
    participant Yandex as YandexGPT

    Rust->>Python: POST /v1/explanations (task metadata)
    Python->>Redis: GET explanation:cache:{task_id}
    alt cache hit
        Redis-->>Python: cached value
        Python-->>Rust: explanation (source=cache)
    else cache miss
        Python->>Qdrant: search rules_embeddings (k=5)
        Python->>Yandex: completion(prompt) [feature flag]
        alt Yandex success
            Yandex-->>Python: explanation text
        else failure/timeout
            Python->>MongoDB: fallback template
        end
        Python->>Redis: SETEX explanation:cache:{task_id}
        Python-->>Rust: explanation (source=yandexgpt/fallback)
    end
`

## RAG Pipeline
1. Fetches task/template/topic metadata from MongoDB.
2. Normalises user_errors with pymorphy2/Natasha to build a richer query.
3. Generates embeddings via sentence-transformers/paraphrase-multilingual-mpnet-base-v2 (fastText/hash fallback).
4. Queries Qdrant ules_embeddings (k=5) and assembles rule snippets for the prompt.
5. Builds a YandexGPT prompt that includes learner level, task description and retrieved context.
6. Respects feature flag explanation_yandexgpt_enabled; falls back to Mongo templates when disabled or when GPT times out/returns 5xx.

## Embedding Pipeline
- Redis Stream content:changes → EmbeddingWorker (async background task) picks events via consumer group explanation-workers.
- For ules updates the worker recomputes embeddings and upserts them into Qdrant; deleted/deprecated items are removed.
- CLI python-generator/scripts/rebuild_embeddings.py performs a full reindex of all rules (Typer-based utility).
- MaintenanceScheduler (apscheduler) periodically creates Qdrant snapshots (snapshot_cron) and emits backlog metrics (STREAM_BACKLOG).

## Observability & Resilience
- Middleware: CORS, Redis-backed rate limiter (120 rpm/IP), circuit breaker (opens after 4 failures for 20s), tracing-ready logging (python-json-logger).
- Metrics (/metrics): request latency histogram, cache hits/misses, YandexGPT error counter, Redis stream lag gauge.
- Feature flags cached in Redis (eature_flag:{name}, TTL 5m); explanation_yandexgpt_enabled toggles LLM usage runtime.
- Redis cache explanation:cache:{task_id} (TTL 5m) stores response body + fingerprint ensuring identical requests reuse results.

## Configuration
Key environment variables:
| Variable | Description | Default |
| --- | --- | --- |
| MONGODB_URI / MONGODB_DB | MongoDB connection for tasks/rules/templates | mongodb://localhost:27017 |
| REDIS_URL | Redis for cache + stream processing | redis://localhost:6379/0 |
| QDRANT_URL / QDRANT_API_KEY | Vector storage | http://localhost:6333 |
| YANDEXGPT_API_KEY / YANDEXGPT_FOLDER_ID | Credentials for completion API | None (required) |
| YANDEXGPT_API_URL | YandexGPT API endpoint | https://llm.api.cloud.yandex.net/... |
| YANDEXGPT_MODEL | Model name (yandexgpt-lite, yandexgpt) | yandexgpt-lite |
| YANDEXGPT_TEMPERATURE | Sampling temperature (0.0-1.0) | 0.2 |
| YANDEXGPT_MAX_TOKENS | Max response tokens | 700 |
| YANDEXGPT_TIMEOUT_SECONDS | Request timeout | 2.0 |
| YANDEXGPT_SYSTEM_PROMPT | System prompt for LLM | "Ты — преподаватель..." |
| EXPLANATION_YANDEXGPT_ENABLED | Feature flag to enable/disable LLM | true |
| REDIS_STREAM_NAME | Redis stream for content changes | content:changes |

See ackend/python-generator/README.md and CLI help (python scripts/rebuild_embeddings.py --help) for operational details.
