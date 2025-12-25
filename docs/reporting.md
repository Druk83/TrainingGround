# Reporting & Analytics

## Цели
Куратор видит целостную картину успеваемости группы, может быстро выгружать CSV/PDF отчёты и не выходит за пределы своих групп. Сервис reporting/analytics обязан:

- Поддерживать KPI (accuracy, hints usage, avg time) по уровням/темам/группам;
- Обновлять материализованные агрегаты (`materialized_stats`, `leaderboards`) ≥ раз в час и хранить готовые данные 24 ч;
- Предоставлять API с RLS (JWT `role` + `group_ids`) и rate limiting экспортов;
- Генерировать подписанные ссылки на CSV/PDF, отправлять уведомления и интегрироваться в мониторинг.

## Архитектура

### Analytics Worker (`reporting-worker`)

- Запускается автономно (cargo bin `reporting-worker`, configurable `REPORTING_WORKER_INTERVAL_SECS`, 3600 s по умолчанию).
- Считывает группы, уровни и прогресс, агрегация:
  - `stat_type=group/level/topic`, `metrics`: `avg_accuracy`, `avg_score`, `total_attempts`, `total_users`;
  - Перезаписывает leaderboard (global + по группам) с сортировкой по `score`.
- Пишет данные в `materialized_stats`, `leaderboards`, регулярно перезапуская `ReportingService::upsert_*`.
- В конфиге есть фич-флаг `REPORTING_ENABLE_LIVE_UPDATES` и TTL экспорта `REPORTING_EXPORT_TTL_HOURS`.
- `export-worker` (Rust-бинари `export-worker`) сканирует `report_exports`, генерирует CSV/PDF, сохраняет в объектное хранилище и обновляет статусы библиотек (pending → processing → ready/failed), выставляя `storage_key` и логируя ссылки.

### Mongo collection overview

- `materialized_stats` — уникальный `{type, entity_id}` документ с предрасчитанными KPI, TTL не задаётся (управляется воркером).
- `leaderboards` — scope (global/group/level), `scope_id`, `rankings[]`, запись перезаписывается каждый тик воркера и TTL 24 ч.
- `report_exports` — хранит статус, фильтры, ссылку `storage_key`, `expiresAt`; используется для rate limiting и подписки на ссылки.

## Reporting API (`/stats/...`)

Маршруты защищены JWT через `middlewares::auth`.

### `GET /stats/groups/{id}`

Возвращает `GroupStatsResponse` (materialized stat + leaderboard). RLS: учитель должен быть частью группы (`group_ids`), админ доступен ко всем.

### `GET /stats/users/{id}`

Возвращает прогресс из `progress_summary`. Доступ: админ везде, учитель — только по своим группам.

### `GET /stats/topics/{id}`

Возвращает последние `StatType::Topic`.

### `POST /stats/groups/{id}/export`

Запрашивает генерацию CSV/PDF:

- Тело: `{ topic_ids: string[], period: { from, to }, format: 'csv' | 'pdf' }`.
- Проверяется rate limit (`REPORTING_EXPORT_RATE_LIMIT_PER_HOUR`).
- Создаётся запись `report_exports`, статус `pending`.
- По готовности backend пишет `storage_key`, подписанный URL TTL = `REPORTING_SIGNED_URL_TTL_HOURS`, и уведомляет о ссылке.

## Подписанные ссылки & Object Storage

- Объектное хранилище настраивается через `OBJECT_STORAGE_*` в env (bucket, endpoint, credentials, prefix).
- `ObjectStorageClient` генерирует SigV4-подпись, TTL по конфига `REPORTING_SIGNED_URL_TTL_HOURS`.
- Отчёты экспортируются `report_worker` (или аналог), результат сохраняется, ссылка возвращается клиенту при статусе `ready`.

## Мониторинг & SLA

- Worker: метрики `reporting_worker_ticks_total`, `reporting_worker_errors_total`, alert если тик > 90 s.
- API: latency < 5 s для `GET /stats`, экспорт < 10 s, rate limit 5 в час.
- Security: RLS, JWT claims, rate limiting экспорта, подписанные S3-URL.
- Дополнительно:
  - `analytics_worker_ticks_total` и `export_worker_ticks_total` метят успешные/ошибочные итерации воркеров.
  - `exports_generated_total` показывает готовые CSV/PDF (разделять по `format`), `http_request_duration_seconds` и `http_requests_total` покрывают API.
  - Алерт: если `analytics_worker_ticks_total{status="error"}` или `export_worker_ticks_total{status="error"}` проскакивает >0 за 5 мин или если `exports_generated_total` не растёт.

## Следующие шаги

1. Реализовать генерацию CSV/PDF (Python/Rust worker) и нотификацию (email/Telegram/токен).
2. Подключить Playwright тесты для Teacher Dashboard (фильтры, экспорт, багованность ролей).
3. Добавить интеграционные сценарии в docker-compose и мониторинг (Grafana alert). 
