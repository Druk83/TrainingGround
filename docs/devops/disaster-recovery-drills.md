# Disaster Recovery Drills

Документация по проведению учений для проверки готовности системы к восстановлению после сбоев.

## Цели DR Drills

1. Проверить процедуры восстановления после сбоев
2. Убедиться в корректности алертов и уведомлений
3. Обучить DevOps команду реагированию на инциденты
4. Валидировать документацию в runbooks

## Частота проведения

- Критические сценарии: ежемесячно
- Полный набор сценариев: ежеквартально
- После значительных изменений инфраструктуры

## Сценарии учений

### 1. Падение MongoDB Primary Node

**Описание:** Симуляция отказа primary узла MongoDB replica set.

**Запуск:**
```bash
./infra/tests/dr-drills/mongodb-primary-failure.sh
```

**Ожидаемое поведение:**
- Replica set автоматически выберет новый primary (30-60 сек)
- Алерт `MongoDBPrimaryDown` отправлен в Telegram
- API продолжает работать с новым primary
- Логи содержат записи о failover

**Проверки:**
- [ ] Алерт пришел в течение 2 минут
- [ ] Новый primary избран автоматически
- [ ] API не возвращает ошибок подключения к БД
- [ ] Trace ID всех запросов сохранены в логах

**Rollback:**
```bash
docker-compose restart mongodb-primary
```

---

### 2. Падение Redis

**Описание:** Симуляция недоступности Redis (кэш, rate limiting, anticheat).

**Запуск:**
```bash
./infra/tests/dr-drills/redis-failure.sh
```

**Ожидаемое поведение:**
- Алерт `RedisDown` отправлен в Telegram
- API продолжает работать (degraded mode)
- Rate limiting отключен (graceful degradation)
- Anticheat счетчики пишутся в fallback очередь
- Cache miss для всех запросов

**Проверки:**
- [ ] Алерт пришел в течение 2 минут
- [ ] API возвращает 200 OK (не 500)
- [ ] Логи содержат WARNING о недоступности Redis
- [ ] После восстановления очередь обработана

**Rollback:**
```bash
docker-compose restart redis
```

---

### 3. Падение Qdrant (Vector DB)

**Описание:** Симуляция недоступности Qdrant (семантический поиск).

**Запуск:**
```bash
./infra/tests/dr-drills/qdrant-failure.sh
```

**Ожидаемое поведение:**
- Алерт `QdrantDown` отправлен
- Семантический поиск недоступен
- Fallback на простой поиск по ключевым словам
- Админ-панель отображает статус "degraded"

**Проверки:**
- [ ] Алерт отправлен
- [ ] Поиск работает в режиме fallback
- [ ] Пользователи получают уведомление о деградации
- [ ] После восстановления индексы синхронизированы

**Rollback:**
```bash
docker-compose restart qdrant
```

---

### 4. Переполнение диска MongoDB

**Описание:** Симуляция заполнения диска MongoDB до критического уровня.

**Запуск:**
```bash
./infra/tests/dr-drills/mongodb-disk-full.sh
```

**Ожидаемое поведение:**
- Алерт `MongoDBDiskSpaceHigh` (warning при >80%)
- Алерт `MongoDBDiskSpaceCritical` (critical при >90%)
- Автоматическая очистка старых логов
- Runbook процедура вызвана

**Проверки:**
- [ ] Warning алерт при 80%
- [ ] Critical алерт при 90%
- [ ] Автоочистка выполнена
- [ ] Telegram уведомление получено

**Rollback:**
```bash
# Скрипт автоматически очищает тестовые данные
```

---

### 5. Падение Vault (Secrets Manager)

**Описание:** Симуляция недоступности HashiCorp Vault.

**Запуск:**
```bash
./infra/tests/dr-drills/vault-failure.sh
```

**Ожидаемое поведение:**
- Существующие сервисы продолжают работать (кэшированные секреты)
- Новые deployments невозможны
- Алерт `VaultDown` отправлен
- Расшифровка PII работает (ключи в памяти)

**Проверки:**
- [ ] API продолжает работать
- [ ] Алерт отправлен
- [ ] Новые connection attempts логируются
- [ ] После восстановления Vault unsealed

**Rollback:**
```bash
docker-compose restart vault
# Manual unseal required:
docker-compose exec vault vault operator unseal <key1>
docker-compose exec vault vault operator unseal <key2>
docker-compose exec vault vault operator unseal <key3>
```

---

### 6. Network Partition

**Описание:** Симуляция разделения сети между сервисами.

**Запуск:**
```bash
./infra/tests/dr-drills/network-partition.sh
```

**Ожидаемое поведение:**
- Алерты `ServiceUnreachable` для затронутых сервисов
- Timeouts и retries с exponential backoff
- Circuit breaker открывается после N неудачных попыток
- Логи содержат trace ID для корреляции

**Проверки:**
- [ ] Circuit breaker срабатывает
- [ ] Retries с backoff выполняются
- [ ] Алерты отправлены
- [ ] Система восстанавливается после устранения partition

**Rollback:**
```bash
# Скрипт автоматически восстанавливает сеть через 60 сек
```

---

### 7. Массовая Anticheat атака

**Описание:** Симуляция массовой атаки с большим количеством нарушений.

**Запуск:**
```bash
./infra/tests/dr-drills/anticheat-attack.sh
```

**Ожидаемое поведение:**
- Алерт `AnticheatIncidentsSpike` (>25 за 5 минут)
- Автоматическая блокировка нарушителей
- Redis Pub/Sub публикует события
- Telegram уведомления отправлены
- Webhook в SOC срабатывает

**Проверки:**
- [ ] Алерт отправлен при превышении порога
- [ ] Инциденты сохранены в MongoDB
- [ ] Telegram уведомления получены
- [ ] Админ-панель показывает spike на графике
- [ ] SmartCaptcha автоматически включена (если настроена)

**Rollback:**
```bash
# Разблокировка тестовых пользователей
./infra/tests/dr-drills/cleanup-test-incidents.sh
```

---

### 8. Prometheus/Grafana недоступны

**Описание:** Симуляция отказа мониторинга.

**Запуск:**
```bash
./infra/tests/dr-drills/monitoring-failure.sh
```

**Ожидаемое поведение:**
- Метрики не собираются
- Дашборды недоступны
- Fallback алерты через CloudWatch/StatusPage
- Логи продолжают записываться в Loki

**Проверки:**
- [ ] Fallback алерт механизм активирован
- [ ] Логи доступны через Loki напрямую
- [ ] Метрики буферизируются локально
- [ ] После восстановления метрики восстановлены из буфера

**Rollback:**
```bash
docker-compose restart prometheus grafana
```

---

## Проведение учений

### Pre-drill checklist

1. Уведомить команду о запланированных учениях
2. Создать резервную копию критических данных
3. Убедиться что production изолирован
4. Подготовить stopwatch для измерения времени реакции
5. Открыть Grafana и Telegram для мониторинга алертов

### Во время учений

1. Запустить сценарий
2. Зафиксировать время начала
3. Отслеживать алерты и логи
4. Документировать действия команды
5. Замерить время восстановления (MTTR - Mean Time To Recovery)

### Post-drill checklist

1. Выполнить rollback
2. Проверить что все сервисы восстановлены
3. Заполнить отчет о результатах
4. Обновить runbooks при необходимости
5. Провести ретроспективу с командой

---

## Шаблон отчета

```markdown
# DR Drill Report

**Дата:** YYYY-MM-DD
**Сценарий:** [название]
**Участники:** [список]

## Метрики

- Time to Detection (TTD): XX минут
- Time to Alert (TTA): XX минут
- Mean Time to Recovery (MTTR): XX минут

## Результаты

- [ ] Алерты сработали корректно
- [ ] Команда следовала runbook
- [ ] Система восстановлена успешно
- [ ] Пользователи не пострадали

## Проблемы

1. [Описание проблемы]
   - Причина: ...
   - Action item: ...

## Улучшения

1. [Что можно улучшить в процессе]
2. [Обновления документации]

## Подписи

DevOps Lead: __________
Date: __________
```

---

## Автоматизация

Для автоматического запуска полного набора учений:

```bash
# Запуск всех сценариев с отчетом
./infra/tests/dr-drills/run-all-drills.sh --report
```

Отчет сохраняется в `docs/devops/drill-reports/YYYY-MM-DD.md`

---

## Метрики успешности

Целевые показатели:
- Time to Detection: < 2 минуты
- Time to Alert: < 2 минуты
- Mean Time to Recovery: < 15 минут
- Alert Accuracy: > 95% (без false positives)

---

**Последнее обновление:** 2026-01-02
**Следующие учения:** Ежемесячно, первый вторник месяца
