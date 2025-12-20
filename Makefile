# Makefile для TrainingGround проекта
.PHONY: setup dev-setup test lint format audit pre-commit help

# Первоначальная настройка окружения
setup:
	@echo "Setting up development environment..."
	@powershell -ExecutionPolicy Bypass -File scripts/setup-dev.ps1

# Установка зависимостей (после настройки окружения)
dev-setup:
	@echo "Installing project dependencies..."
	@if exist frontend (cd frontend && npm install)
	@if exist backend\rust-api (cd backend\rust-api && cargo build)
	@if exist backend\python-generator (cd backend\python-generator && pip install -e .[dev])

# Запуск всех тестов
test:
	@echo "Running all tests..."
	@if exist frontend (cd frontend && npm test)
	@if exist backend\rust-api (cd backend\rust-api && cargo test)
	@if exist backend\python-generator (cd backend\python-generator && pytest)

# Линтинг всех компонентов
lint:
	@echo "Running linters..."
	@if exist frontend (cd frontend && npm run lint)
	@if exist backend\rust-api (cd backend\rust-api && cargo clippy -- -D warnings)
	@if exist backend\python-generator (cd backend\python-generator && ruff check src/ tests/)

# Форматирование кода
format:
	@echo "Formatting code..."
	@if exist frontend (cd frontend && npm run format)
	@if exist backend\rust-api (cd backend\rust-api && cargo fmt)
	@if exist backend\python-generator (cd backend\python-generator && black src/ tests/)

# Security audit
audit:
	@echo "Running security audits..."
	@if exist frontend (cd frontend && npm audit)
	@if exist backend\rust-api (cd backend\rust-api && cargo audit)
	@if exist backend\python-generator (cd backend\python-generator && pip-audit)

# Ручной запуск pre-commit проверок
pre-commit:
	@powershell -ExecutionPolicy Bypass -File scripts/pre-commit.ps1

# Запуск локального окружения
up:
	@echo "Starting local environment..."
	docker-compose up -d

# Остановка локального окружения
down:
	@echo "Stopping local environment..."
	docker-compose down

# Логи сервисов
logs:
	docker-compose logs -f

# Помощь
help:
	@echo "Available commands:"
	@echo "  make setup       - Initial setup (install tools, configure hooks)"
	@echo "  make dev-setup   - Install project dependencies"
	@echo "  make test        - Run all tests"
	@echo "  make lint        - Run all linters"
	@echo "  make format      - Format all code"
	@echo "  make audit       - Run security audits"
	@echo "  make pre-commit  - Run pre-commit checks manually"
	@echo "  make up          - Start local environment (Docker)"
	@echo "  make down        - Stop local environment"
	@echo "  make logs        - Show service logs"
	@echo "  make help        - Show this help message"
