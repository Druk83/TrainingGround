#!/bin/bash
set -e

echo "Setting up development environment..."

# 1. Установка git hooks
echo "Installing git hooks..."
git config core.hooksPath .githooks
chmod +x .githooks/*
chmod +x scripts/*.sh

# 2. Проверка зависимостей
echo "Checking dependencies..."

# Node.js
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js not found. Please install Node.js 24+"
    exit 1
fi
echo "[INFO] Node.js version: $(node --version)"

# Rust
if ! command -v cargo &> /dev/null; then
    echo "[ERROR] Rust not found. Install from: https://rustup.rs/"
    exit 1
fi
echo "[INFO] Rust version: $(rustc --version)"

# Python
if ! command -v python3 &> /dev/null; then
    echo "[ERROR] Python 3.14+ not found"
    exit 1
fi
echo "[INFO] Python version: $(python3 --version)"

# Docker
if ! command -v docker &> /dev/null; then
    echo "[ERROR] Docker not found. Install Docker Desktop"
    exit 1
fi
echo "[INFO] Docker version: $(docker --version)"

# pkg-config + OpenSSL headers
if ! command -v pkg-config &> /dev/null; then
    echo "[WARN] pkg-config not found; install it with your package manager (e.g. sudo apt install pkg-config)"
else
    if ! pkg-config --exists openssl; then
        echo "[WARN] OpenSSL dev files missing; install libssl-dev (or the distro equivalent) so pkg-config can find OpenSSL"
    else
        echo "[INFO] OpenSSL found via pkg-config"
    fi
fi

# Docker group membership (allows running docker without sudo)
if id -Gn 2> /dev/null | grep -qw docker; then
    echo "[INFO] User is in docker group"
else
    echo "[WARN] Current user is not in the 'docker' group; run sudo usermod -aG docker \$USER and relogin to avoid sudo when running make up"
fi

# 3. Создание директорий
echo "Creating project directories..."
mkdir -p frontend backend/rust-api backend/python-generator docs

# 4. Создание .env файлов
if [ ! -f ".env" ]; then
    echo "Creating .env file..."
    cp .env.example .env
    echo "[INFO] Please configure .env with your settings"
fi

# 5. Создание документации
echo "Generating dev-setup.md..."
cat > docs/dev-setup.md << 'EOF'
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
EOF

echo "[SUCCESS] Development environment ready!"
echo ""
echo "Next steps:"
echo "  1. Configure .env with your settings"
echo "  2. Run 'make up' to start local services (requires docker-compose.yml)"
echo "  3. Start coding! Pre-commit hooks will run automatically"
