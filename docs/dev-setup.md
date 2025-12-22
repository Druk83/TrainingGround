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
   # Отредактировать параметры
   ```

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

Секреты (JWT_SECRET, MONGO_PASSWORD, REDIS_PASSWORD, QDRANT_API_KEY, GRAFANA_PASSWORD) управляются через корневой файл `.env`. Смотрите `docs/security/secrets.md` для рекомендаций по ротации и использованию в продакшне.


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
