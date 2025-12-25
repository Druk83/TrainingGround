# Настройка окружения разработки

## Первоначальная настройка

1. Клонировать репозиторий:
   ```bash
   git clone <repo-url>
   cd TrainingGround
   ```

2. Запустить скрипт настройки:
   ```bash
   # Linux/macOS
   ./scripts/setup-dev.sh
   
   # Windows
   powershell -ExecutionPolicy Bypass -File scripts/setup-dev.ps1
   ```

3. Настроить `.env`:
   ```bash
   cp .env.example .env
   # Отредактировать параметры (см. ниже)
   ```

### Обязательные переменные окружения

После копирования `.env.example` в `.env` необходимо заполнить следующие переменные:

#### Критические секреты (ОБЯЗАТЕЛЬНО изменить для production)

```bash
# JWT Secret - используется для подписи токенов аутентификации
# Генерация: openssl rand -base64 32
JWT_SECRET=<YOUR_JWT_SECRET_GENERATE_WITH_openssl_rand_base64_32>

# MongoDB
MONGO_PASSWORD=<YOUR_MONGO_PASSWORD>  # Генерация: openssl rand -base64 24

# Redis
REDIS_PASSWORD=<YOUR_REDIS_PASSWORD>  # Генерация: openssl rand -base64 24

# Qdrant
QDRANT_API_KEY=<YOUR_QDRANT_API_KEY>  # Генерация: openssl rand -base64 24

# Grafana
GRAFANA_PASSWORD=<YOUR_GRAFANA_PASSWORD>  # Для доступа в веб-интерфейс

# Metrics endpoint authentication (format: username:password)
METRICS_AUTH=prometheus:<YOUR_METRICS_PASSWORD>  # Для защиты /metrics endpoint
```

#### Object Storage (для экспорта отчетов)

```bash
# Development (локальный MinIO):
OBJECT_STORAGE_BUCKET=<YOUR_PRODUCTION_BUCKET>
OBJECT_STORAGE_REGION=ru-central1
OBJECT_STORAGE_ENDPOINT=http://localhost:9000
OBJECT_STORAGE_ACCESS_KEY=<YOUR_ACCESS_KEY>
OBJECT_STORAGE_SECRET_KEY=<YOUR_ACCESS_KEY>
OBJECT_STORAGE_REPORTS_PREFIX=reports/dev

# Production (Yandex Cloud Object Storage):
# Получить credentials: https://cloud.yandex.ru/docs/iam/operations/sa/create-access-key
OBJECT_STORAGE_BUCKET=<YOUR_PRODUCTION_BUCKET>
OBJECT_STORAGE_REGION=ru-central1
OBJECT_STORAGE_ENDPOINT=https://storage.yandexcloud.net
OBJECT_STORAGE_ACCESS_KEY=<YOUR_ACCESS_KEY>
OBJECT_STORAGE_SECRET_KEY=<YOUR_SECRET_KEY>
OBJECT_STORAGE_REPORTS_PREFIX=reports/prod
```

#### YandexGPT API (для объяснений ошибок)

```bash
# Получить API ключ: https://cloud.yandex.ru/docs/iam/operations/api-key/create
YANDEXGPT_API_KEY=<YOUR_YANDEXGPT_API_KEY>
YANDEXGPT_FOLDER_ID=<YOUR_YANDEX_FOLDER_ID>
```

#### Опциональные настройки (можно оставить по умолчанию)

```bash
# Reporting system defaults
REPORTING_SIGNED_URL_TTL_HOURS=24
REPORTING_EXPORT_TTL_HOURS=24
REPORTING_EXPORT_RATE_LIMIT_PER_HOUR=5
REPORTING_LIVE_POLLING_INTERVAL_SECS=30
REPORTING_ENABLE_LIVE_UPDATES=true
REPORTING_EXPORT_WORKER_INTERVAL_SECS=60
REPORTING_WORKER_INTERVAL_SECS=3600
```

ВАЖНО:
- НЕ коммитить файл `.env` в git (он в `.gitignore`)
- Использовать `.env.example` как шаблон
- В production обязательно генерировать уникальные секреты
- См. подробнее: [docs/security/secrets.md](security/secrets.md)

4. Запустить локальное окружение:
   ```bash
   make up
   ```

## Pre-commit проверки

Pre-commit хуки запускаются **автоматически** при каждом `git commit`:

1. **Линтеры** — проверка стиля кода
2. **Форматтеры** — проверка форматирования
3. **Type checkers** — проверка типов
4. **Unit тесты** — измененные файлы
5. **Security audit** — проверка уязвимостей

### Если commit заблокирован:

```bash
# Исправить проблемы автоматически
make format

# Запустить проверки вручную
make pre-commit

# После исправления - коммитить снова
git commit
```

## Полезные команды

```bash
make test          # Все тесты
make lint          # Все линтеры
make format        # Форматирование
make audit         # Security audit
make up            # Запуск окружения
make logs          # Логи сервисов
```

## Troubleshooting

### Pre-commit хуки не срабатывают
```bash
git config core.hooksPath .githooks
chmod +x .githooks/*
```

### npm audit находит уязвимости
```bash
cd frontend
npm audit fix
```

### cargo clippy выдает warnings
```bash
cd backend/rust-api
cargo clippy --fix
```

### Python тесты падают
```bash
cd backend/python-generator
pytest -v  # подробный вывод
```

## Структура проекта

```
TrainingGround/
├── .githooks/          # Git hooks для Rust/Python
├── .husky/             # Git hooks для Frontend (Node.js)
├── frontend/           # PWA приложение
├── backend/
│   ├── rust-api/       # Основной API
│   └── python-generator/ # Генератор заданий
├── docker-compose.yml  # Локальное окружение
├── Makefile            # Команды разработки
└── scripts/            # Утилиты автоматизации
```

## Требования

- **Node.js** 24+
- **Rust** 1.89+
- **Python** 3.14+
- **Docker** 24+
- **Git** 2.30+

## Настройка IDE

### VS Code
Рекомендуемые расширения:
- Rust Analyzer
- ESLint
- Prettier
- Python
- Docker

### WebStorm / IntelliJ IDEA
- Включить EditorConfig support
- Установить Rust plugin
- Включить ESLint / Prettier

## Работа с Docker

```bash
# Windows
dev.cmd up          # Запуск всех сервисов
dev.cmd down        # Остановка
dev.cmd logs        # Просмотр логов

# Или напрямую через docker-compose
docker-compose up -d
docker-compose down
docker-compose logs -f

# Linux/macOS
make up
make down
make logs

# Очистка volumes (ВНИМАНИЕ: удалит все данные)
docker-compose down -v
```

## Инициализация хранилищ данных

## Секреты и ротация

Все секреты управляются через корневой файл `.env`:
- **JWT_SECRET** - подпись JWT токенов (КРИТИЧНО)
- **MONGO_PASSWORD** - доступ к базе данных
- **REDIS_PASSWORD** - доступ к кешу и сессиям
- **QDRANT_API_KEY** - доступ к векторной БД
- **GRAFANA_PASSWORD** - доступ к мониторингу
- **METRICS_AUTH** - HTTP Basic Auth для /metrics endpoint (формат: username:password)
- **OBJECT_STORAGE_ACCESS_KEY**, **OBJECT_STORAGE_SECRET_KEY** - доступ к хранилищу отчетов
- **YANDEXGPT_API_KEY** - доступ к YandexGPT API

### Доступ к метрикам

Endpoint `/metrics` защищен HTTP Basic Authentication. Для доступа используйте:
```bash
curl -u prometheus:changeMePrometheus http://localhost:8080/metrics
```

Или настройте Prometheus в `infra/prometheus/prometheus.yml`:
```yaml
scrape_configs:
  - job_name: 'trainingground-api'
    static_configs:
      - targets: ['api:8080']
    basic_auth:
      username: prometheus
      password: changeMePrometheus  # Используйте значение из METRICS_AUTH
```

Смотрите `docs/security/secrets.md` для рекомендаций по ротации и использованию в продакшне.


### Установка Python зависимостей

Перед работой с инфраструктурными скриптами установите зависимости:

```bash
# Windows
infra\install-deps.cmd

# Linux/macOS
pip install -r infra/requirements.txt
```

### MongoDB

MongoDB инициализируется автоматически при первом запуске через скрипты в `infra/mongo-init/`:

```bash
# Проверить статус MongoDB
docker-compose exec mongodb mongosh -u ${MONGO_USER:-admin} -p ${MONGO_PASSWORD:-password} --eval "db.adminCommand('ping')"

# Просмотреть коллекции
docker-compose exec mongodb mongosh -u ${MONGO_USER:-admin} -p ${MONGO_PASSWORD:-password} trainingground --eval "show collections"

# Проверить индексы
docker-compose exec mongodb mongosh -u ${MONGO_USER:-admin} -p ${MONGO_PASSWORD:-password} trainingground --eval "db.users.getIndexes()"
```

**Важно:** Change Streams требуют replica set. Для dev окружения:

```bash
docker-compose exec mongodb mongosh -u ${MONGO_USER:-admin} -p ${MONGO_PASSWORD:-password} --eval "rs.initiate()"
```

### Redis

Redis готов к работе сразу после запуска:

```bash
# Проверить подключение
docker-compose exec redis redis-cli -a ${REDIS_PASSWORD:-redispass} PING

# Просмотреть ключи (ВНИМАНИЕ: не использовать в production)
docker-compose exec redis redis-cli -a ${REDIS_PASSWORD:-redispass} --scan --pattern 'session:*'

# Проверить Lua скрипт
docker-compose exec redis redis-cli -a ${REDIS_PASSWORD:-redispass} --eval /path/to/purchase_hint.lua
```

### Qdrant


### Grafana

Если вы включили Grafana в `docker-compose`, пароль администратора берётся из переменной `GRAFANA_PASSWORD` в корневом файле `.env` (значение по умолчанию: `admin`).

Откройте http://localhost:3000 и войдите под пользователем `admin`, пароль — `${GRAFANA_PASSWORD:-admin}`.

Файлы provisioning и дашбордов читаются из `infra/grafana/provisioning` и `infra/grafana/dashboards`, если эти каталоги присутствуют.

Инициализация коллекций:

```bash
# Запустить скрипт инициализации
python infra/qdrant/init_collections.py

# Проверить коллекции через API (используйте переменную окружения QDRANT_API_KEY)
curl http://localhost:6333/collections -H "api-key: ${QDRANT_API_KEY:-qdrantkey}"

# Проверить количество векторов
curl http://localhost:6333/collections/rules_embeddings -H "api-key: ${QDRANT_API_KEY:-qdrantkey}"
```

## Backup и Restore

### Создание backup

```bash
# Полный backup (MongoDB + Redis + Qdrant)
bash infra/scripts/backup.sh

# Backup загружается в Yandex Object Storage
# Расположение: s3://trainingground-backups/full_backup/{timestamp}/
```

### Восстановление из backup

```bash
# Список доступных backup'ов
aws s3 ls s3://trainingground-backups/full_backup/ --endpoint-url https://storage.yandexcloud.net

# Восстановить из конкретного backup
bash infra/scripts/restore.sh 20251220_143000
```

**Время восстановления:** ≤15 минут (требование SLA)

## Тестирование

```bash
# Все тесты
make test

# Отдельные компоненты
cd frontend && npm test
cd backend/rust-api && cargo test
cd backend/python-generator && pytest

# С coverage
cd frontend && npm run test:coverage
cd backend/rust-api && cargo tarpaulin
cd backend/python-generator && pytest --cov
```

## CI/CD

Проект использует GitLab CI или Yandex Cloud CI. Конфигурация в `.gitlab-ci.yml`.

Все проверки CI/CD **идентичны** pre-commit хукам:
- Если commit проходит локально → пройдет в CI
- Если CI падает → значит проверки не запустились локально

## Получение помощи

- **Документация**: `docs/`
- **Issues**: Создать issue в GitLab
- **Chat**: Корпоративный Telegram/Slack
