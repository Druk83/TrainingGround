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

- **Node.js** 20+
- **Rust** 1.75+
- **Python** 3.12+
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
# Запуск всех сервисов
make up

# Остановка
make down

# Перезапуск отдельного сервиса
docker-compose restart rust-api

# Просмотр логов
make logs

# Очистка volumes (ВНИМАНИЕ: удалит все данные)
docker-compose down -v
```

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
