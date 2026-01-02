# Feature Flags Monitoring Guide

## Метрики (Metrics)

Система Feature Flags экспортирует следующие метрики в Prometheus:

### Основные метрики

| Метрика | Тип | Описание | Ед. изм. |
|---------|-----|---------|---------|
| `feature_flags_check_total` | counter | Общее количество проверок флагов | штук |
| `feature_flags_cache_hits` | counter | Попадания в Redis кэш | штук |
| `feature_flags_cache_misses` | counter | Промахи кэша | штук |
| `feature_flags_active_total` | gauge | Количество активных (enabled=true) флагов | штук |
| `feature_flags_updated_total` | counter | Количество обновлений флагов | штук |
| `feature_flags_update_timestamp` | gauge | Timestamp последнего обновления | unix time |

### Вычисляемые метрики

```promql
# Cache hit rate (0-100%)
(increase(feature_flags_cache_hits[5m]) / 
 (increase(feature_flags_cache_hits[5m]) + increase(feature_flags_cache_misses[5m]))) * 100

# Flag check rate per second
rate(feature_flags_check_total[1m])

# Flag updates per minute
rate(feature_flags_updated_total[1m])
```

## Алерты (Alerts)

### 1. FeatureFlagsUpdatedFrequently (Warning)

**Условие:** Более 5 флагов обновлено за 5 минут

**Причины:**
- Активное A/B тестирование
- Экспериментирование с конфигурацией
- Возможный баг в API

**Действие:**
- Проверить логи Admin API
- Убедиться, что обновления авторизованы
- Проверить, не происходит ли циклических обновлений

### 2. FeatureFlagsCacheHitRateLow (Warning)

**Условие:** Cache hit rate < 70% за последние 5 минут

**Причины:**
- Redis недоступен или перезагружается
- Ключ кэша не совпадает между запросами (разные контексты user/group)
- Флаги часто обновляются (TTL истекает быстро)

**Действие:**
- Проверить статус Redis: `redis-cli ping`
- Проверить память Redis: `redis-cli info memory`
- Увеличить TTL кэша если фиксированные флаги
- Проверить логи кэширования

### 3. NoActiveFeatureFlags (Critical)

**Условие:** Нет активных флагов (feature_flags_active_total == 0)

**Причины:**
- Все флаги отключены администратором
- Ошибка инициализации данных
- Проблема с базой данных

**Действие:**
- Немедленно проверить MongoDB
- Восстановить флаги из бэкапа
- Проверить логи инициализации
- Явно включить базовые флаги (hints_enabled, explanation_api_enabled)

### 4. FeatureFlagsCheckRateAnomaly (Warning)

**Условие:** Частота проверок > 10000 в секунду

**Причины:**
- DDoS атака на API
- Неправильная конфигурация кэша (слишком частые проверки)
- Баг в коде с бесконечным циклом проверок

**Действие:**
- Проверить источник запросов (IP адреса)
- Проверить логи запросов к API
- Включить rate limiting если необходимо
- Проверить код на циклические вызовы

## Grafana Dashboard

### Рекомендуемые панели

```json
{
  "dashboard": {
    "title": "Feature Flags Monitoring",
    "panels": [
      {
        "title": "Active Flags",
        "targets": [{"expr": "feature_flags_active_total"}],
        "type": "gauge"
      },
      {
        "title": "Check Rate (per second)",
        "targets": [{"expr": "rate(feature_flags_check_total[1m])"}],
        "type": "graph"
      },
      {
        "title": "Cache Hit Rate (%)",
        "targets": [{"expr": "(increase(feature_flags_cache_hits[5m]) / (increase(feature_flags_cache_hits[5m]) + increase(feature_flags_cache_misses[5m]))) * 100"}],
        "type": "graph"
      },
      {
        "title": "Recent Updates (last 24h)",
        "targets": [{"expr": "increase(feature_flags_updated_total[24h])"}],
        "type": "stat"
      },
      {
        "title": "Flag Update Timeline",
        "targets": [{"expr": "feature_flags_update_timestamp"}],
        "type": "graph"
      }
    ]
  }
}
```

## Webhook Интеграция

### Slack

```bash
# В Alertmanager config (alertmanager.yml):
receivers:
  - name: 'feature-flags-slack'
    slack_configs:
      - api_url: 'https://hooks.slack.com/services/YOUR/WEBHOOK/URL'
        channel: '#devops-alerts'
        title: 'Feature Flags Alert'
        text: '{{ .GroupLabels.alertname }} - {{ .GroupLabels.severity }}'
        send_resolved: true
```

### Telegram

```bash
# В Alertmanager config:
receivers:
  - name: 'feature-flags-telegram'
    webhook_configs:
      - url: 'http://telegram-alertmanager-webhook:5001/'
        send_resolved: true
```

**Сообщение будет включать:**
- Имя алерта (AlertName)
- Уровень серьёзности (Severity)
- Описание с текущим значением
- Ссылка на Grafana панель (если настроена)

## Troubleshooting

### Как проверить метрики вручную?

```bash
# curl к Prometheus metrics endpoint
curl http://localhost:9090/api/v1/query?query=feature_flags_check_total

# Или в Prometheus UI:
# http://localhost:9090/graph
# Введите запрос: feature_flags_check_total
```

### Как отключить алерт временно?

```bash
# В Alertmanager можно установить silence:
# Алертмейнер UI -> Silences -> New Silence
# Выбрать label: alertname = "FeatureFlagsUpdatedFrequently"
# Установить duration и reason
```

### Как увеличить метрики в процессе разработки?

Метрики обновляются автоматически при:
1. Проверке флага через `is_enabled()`
2. Обновлении флага через Admin API
3. Попадании/промахе кэша
4. Инициализации сервиса

## Production Checkpoints

- [ ] Prometheus скрейпит метрики с интервалом 30 сек
- [ ] Alertmanager настроен с Slack/Telegram
- [ ] Grafana dashboard импортирована и настроена
- [ ] Все алерты тестированы (вручную отключить флаг для теста)
- [ ] На-call инженер знает о алертах
- [ ] Runbook для каждого алерта создан и доступен

## Примеры использования

### Проверить cache hit rate за последний час

```promql
(increase(feature_flags_cache_hits[1h]) / 
 (increase(feature_flags_cache_hits[1h]) + increase(feature_flags_cache_misses[1h]))) * 100
```

### Найти флаг с наибольшим количеством проверок

```promql
topk(5, rate(feature_flags_check_by_flag[5m]))
```

### Проверить, не было ли обновлений в течение последних 30 минут

```promql
time() - feature_flags_update_timestamp > 1800
```
