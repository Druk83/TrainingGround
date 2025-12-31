# Runbooks DevOps

## Общие сведения
- Alertmanager: http://localhost:9093 (прод: закрыт, используется Telegram/Webhook).
- Grafana: http://localhost:3000 (логин admin / `${GRAFANA_PASSWORD}`).
- Логи: Grafana panel "API logs (Loki)" либо напрямую `http://localhost:3100`.
- Каждый алерт содержит `trace_id` в аннотациях (`X-Trace-Id` также возвращается клиенту).

## ApiLatencyP95TooHigh
1. Проверить Grafana → панель *HTTP p95 latency*.
2. Убедиться, что `histogram_quantile` > 0.2 c более 5 минут.
3. Снять `docker stats` (возможно нехватка CPU) и посмотреть логи `/var/lib/docker/containers/*rust-api*.log` через Loki.
4. Если проблема в Python Generator — проверить `/stats/...` endpoints и очередь `export_worker`.
5. После локализации — эскалировать в backend-команду, приложив `trace_id` и stack trace.

## HintsUnavailable
1. Алерт приходит через Telegram как `severity=critical`.
2. Проверить `sum(rate(hints_requested_total[10m]))` в Grafana/Explore.
3. Посмотреть логи Python сервиса — возможно таймауты YandexGPT (флаг `EXPLANATION_YANDEXGPT_ENABLED`).
4. При необходимости выключить подсказки: в `.env` поставить `ENABLE_YANDEX_GPT=false`, `docker compose restart python-generator`.

## AnticheatIncidentsSpike
1. Grafana панель *Anticheat incidents* показывает рост.
2. Проверить логи Redis (`redis-cli monitor | grep anticheat`).
3. Убедиться, что SmartCaptcha включена (frontend).
4. Если атака, разрешено временно повысить `RATE_LIMIT_PER_IP`/включить `ANTICHEAT_DISABLED=0`.
5. Сообщить службе безопасности, приложить `incidents` из Mongo (`db.incidents.find().sort({timestamp:-1}).limit(20)`).

## ExportWorkerErrors
1. Метрика `export_worker_ticks_total{status="error"}` растёт.
2. Проверить очередь в Mongo коллекции `report_exports` (ищем `status=pending`).
3. Посмотреть объектное хранилище (Minio/S3) — доступ/credentials.
4. При необходимости выгрузить JSON и пересоздать экспорты (endpoint `/stats/exports/{id}/retry`).

## Alertmanager Webhook тест
- Отправить фейковый алерт: `./scripts/alertmanager/send_test_alert.sh` (создаёт событие через API).
- Убедиться, что Telegram и webhook получили сообщение.
