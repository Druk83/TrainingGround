# Античит и инциденты

## Пороговые значения
| Сигнал | Redis ключ | TTL | Порог | Действие |
| --- | --- | --- | --- | --- |
| Скорость ответов | `anticheat:speed:{user_id}` | 3600 сек | >5 — `is_suspicious`, >10 — блокировка | Создаётся `IncidentRecord` + публикация в Redis Pub/Sub |
| Повтор шаблонов | `anticheat:repeated:{user_id}:{answer_hash}` | 3600 сек | >8 | Блокировка пользователя |

- Lua-скрипт выполняет атомарное обновление обоих счетчиков, что исключает гонки.
- Допустимый SLA: скорость проверки <2 сек; нарушения фиксируются в Mongo коллекции `incidents`.

## Инциденты
- `services/anticheat_service.rs` создаёт документ, публикует JSON в Redis канал `incidents` и (в A7) отправляет уведомления:
  - Telegram бот (`ANTICHEAT_TELEGRAM_BOT_TOKEN`, `ANTICHEAT_TELEGRAM_CHAT_ID`) получает критические события (`severity=High|Critical` или `action=Blocked`).
  - HTTP webhook (`ANTICHEAT_INCIDENT_WEBHOOK_URL`) используется для интеграции с внешними SOC/Alertmanager.
- Админ-интерфейс `/admin/incidents` позволяет фильтровать/закрывать инциденты, а также разблокировать пользователя (`/admin/incidents/{id}/unblock`).

## Метрики и алерты
- Prometheus собирает `anticheat_violations_total`, `speed_hits`, `repeated_hits`.
- Правило `AnticheatIncidentsSpike` в `infra/prometheus/rules/sla-rules.yml` срабатывает при >25 инцидентах за 5 минут.
- Grafana панель `Anticheat incidents` (dashboards/observability.json) показывает накопления.

## Ручные операции
1. **Разблокировка ученика:** в админке или командой `POST /admin/incidents/{id}/unblock`. Redis ключ `anticheat:speed:{user}` очищается автоматически.
2. **Очистка очереди webhook:** Redis список `incidents:queue` хранит записи, если Mongo временно недоступен; можно вытянуть значения и повторно отправить скриптом `scripts/drain_incidents_queue.py` (описан в README).
3. **Интеграция SmartCaptcha:** если необходимо включить SmartCaptcha для всех форм, добавить проверки в фронтенд и передавать флаг в Rust API (см. `tasks/A7.md`) — пороги автоматически снизятся.

## Тесты
- `cargo test anticheat_service` проверяет env-флаги (`ANTICHEAT_DISABLED`, `ANTICHEAT_WRITE_ASYNC`).
- Интеграционные тесты (docker-compose + k6) могут искусственно посылать >10 ответов/секунд и ожидать блокировки.
- Для проверки уведомлений установите временный webhook: `ANTICHEAT_INCIDENT_WEBHOOK_URL=http://webhook.site/...` и спровоцируйте нарушение.
