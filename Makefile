# Makefile для TrainingGround проекта
.PHONY: setup dev-setup dev-setup-unix dev-setup-windows test lint format audit pre-commit help

PYTHON_VENV_DIR ?= venv
PYTHON_VENV_ABS := $(abspath $(PYTHON_VENV_DIR))
PYTHON_BIN_UNIX := $(PYTHON_VENV_ABS)/bin/python3
PYTHON_PIP_UNIX := $(PYTHON_VENV_ABS)/bin/pip
CARGO_LOCK_PATH := backend/rust-api/Cargo.lock

DOCKER_COMPOSE_CMD := $(strip $(shell \
	if command -v docker-compose >/dev/null 2>&1; then \
		printf 'docker-compose'; \
	elif docker compose version >/dev/null 2>&1; then \
		printf 'docker compose'; \
	fi))

# Первоначальная настройка окружения
setup:
	@echo "Setting up development environment..."
	@powershell -ExecutionPolicy Bypass -File scripts/setup-dev.ps1

# Установка зависимостей (после настройки окружения)
ifeq ($(OS),Windows_NT)
dev-setup: dev-setup-windows
else
dev-setup: dev-setup-unix
endif

dev-setup-unix: ensure-python-venv-unix
	@echo "Installing project dependencies..."
	@if [ -d frontend ]; then (cd frontend && npm install); fi
	@if [ -f "backend/rust-api/Cargo.toml" ]; then \
		echo "[INFO] Found Cargo.toml in backend/rust-api"; \
		else \
		echo "[ERROR] backend/rust-api/Cargo.toml is missing; please restore it."; \
		exit 1; \
	fi
	@if [ -f "$(CARGO_LOCK_PATH)" ]; then \
		echo "[INFO] Cargo.lock exists"; \
	else \
		echo "[INFO] Generating Cargo.lock"; \
		(cd backend/rust-api && cargo generate-lockfile); \
	fi
	@if [ -f Cargo.lock ] && [ ! -f backend/rust-api/Cargo.lock ]; then \
		echo "[INFO] Copying workspace Cargo.lock into backend/rust-api"; \
		cp Cargo.lock backend/rust-api/Cargo.lock; \
	fi
	@echo "[INFO] Initializing backend/rust-api workspace"
	@(cd backend/rust-api && cargo fetch)
	@if [ -d backend/rust-api ]; then (cd backend/rust-api && cargo build); fi
	@if [ -d backend/python-generator ]; then (cd backend/python-generator && $(PYTHON_BIN_UNIX) -m pip install -e .[dev]); fi

dev-setup-windows:
	@echo "Installing project dependencies..."
	@powershell -NoProfile -ExecutionPolicy Bypass -Command "if (Test-Path frontend) { Set-Location frontend; npm install }"
	@powershell -NoProfile -ExecutionPolicy Bypass -Command "if (Test-Path backend\\rust-api) { Set-Location backend\\rust-api; cargo build }"
	@powershell -NoProfile -ExecutionPolicy Bypass -Command "if (-not (Test-Path venv\\Scripts\\python.exe)) { python -m venv venv }"
	@powershell -NoProfile -ExecutionPolicy Bypass -Command "if (Test-Path backend\\python-generator) { Set-Location backend\\python-generator; ..\\venv\\Scripts\\python.exe -m pip install -e .[dev] }"

ensure-python-venv-unix:
	@if [ ! -d "$(PYTHON_VENV_DIR)" ]; then python3 -m venv "$(PYTHON_VENV_DIR)"; fi

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
ifeq ($(OS),Windows_NT)
	@powershell -ExecutionPolicy Bypass -File scripts/pre-commit.ps1
else
	@bash scripts/pre-commit.sh
endif

# Запуск локального окружения
up:
	@echo "Starting local environment..."
	@if [ -z "$(DOCKER_COMPOSE_CMD)" ]; then \
		echo "docker-compose or docker compose plugin is required to bring up containers"; \
		exit 1; \
	fi
	@$(DOCKER_COMPOSE_CMD) up -d

# Остановка локального окружения
down:
	@echo "Stopping local environment..."
	@if [ -z "$(DOCKER_COMPOSE_CMD)" ]; then \
		echo "docker-compose or docker compose plugin is required to shut down containers"; \
		exit 1; \
	fi
	@$(DOCKER_COMPOSE_CMD) down

# Логи сервисов
logs:
	@if [ -z "$(DOCKER_COMPOSE_CMD)" ]; then \
		echo "docker-compose or docker compose plugin is required to read logs"; \
		exit 1; \
	fi
	@$(DOCKER_COMPOSE_CMD) logs -f

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
