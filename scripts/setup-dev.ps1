# PowerShell script для настройки окружения разработки на Windows
# TrainingGround Project Setup

Write-Host "================================" -ForegroundColor Cyan
Write-Host "TrainingGround Development Setup" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Проверка версии PowerShell
if ($PSVersionTable.PSVersion.Major -lt 5) {
    Write-Host "[ERROR] PowerShell 5.0 or higher is required" -ForegroundColor Red
    exit 1
}

# 1. Проверка зависимостей
Write-Host "[1/7] Checking dependencies..." -ForegroundColor Yellow
Write-Host ""

$dependencies = @()

# Node.js
if (Get-Command node -ErrorAction SilentlyContinue) {
    $nodeVersion = node --version
    Write-Host "  [OK] Node.js $nodeVersion" -ForegroundColor Green
} else {
    Write-Host "  [ERROR] Node.js not found" -ForegroundColor Red
    Write-Host "  Install from: https://nodejs.org/ (v24.x LTS)" -ForegroundColor Yellow
    $dependencies += "Node.js"
}

# Rust
if (Get-Command cargo -ErrorAction SilentlyContinue) {
    $rustVersion = cargo --version
    Write-Host "  [OK] Rust $rustVersion" -ForegroundColor Green
} else {
    Write-Host "  [ERROR] Rust not found" -ForegroundColor Red
    Write-Host "  Install from: https://rustup.rs/" -ForegroundColor Yellow
    $dependencies += "Rust"
}

# Python
if (Get-Command python -ErrorAction SilentlyContinue) {
    $pythonVersion = python --version
    Write-Host "  [OK] Python $pythonVersion" -ForegroundColor Green
} else {
    Write-Host "  [ERROR] Python not found" -ForegroundColor Red
    Write-Host "  Install from: https://www.python.org/ (v3.14+)" -ForegroundColor Yellow
    $dependencies += "Python"
}

# Docker
if (Get-Command docker -ErrorAction SilentlyContinue) {
    $dockerVersion = docker --version
    Write-Host "  [OK] Docker $dockerVersion" -ForegroundColor Green
} else {
    Write-Host "  [ERROR] Docker not found" -ForegroundColor Red
    Write-Host "  Install Docker Desktop: https://www.docker.com/products/docker-desktop/" -ForegroundColor Yellow
    $dependencies += "Docker"
}

# Git
if (Get-Command git -ErrorAction SilentlyContinue) {
    $gitVersion = git --version
    Write-Host "  [OK] Git $gitVersion" -ForegroundColor Green
} else {
    Write-Host "  [ERROR] Git not found" -ForegroundColor Red
    $dependencies += "Git"
}

if ($dependencies.Count -gt 0) {
    Write-Host ""
    Write-Host "[ERROR] Missing dependencies: $($dependencies -join ', ')" -ForegroundColor Red
    Write-Host "Please install missing tools and run setup again." -ForegroundColor Yellow
    exit 1
}

Write-Host ""

# 2. Создание директорий
Write-Host "[2/7] Creating project directories..." -ForegroundColor Yellow

$directories = @(
    ".githooks",
    "scripts",
    "docs",
    "infra",
    "infra\docker",
    "infra\config",
    "infra\scripts"
)

foreach ($dir in $directories) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        Write-Host "  Created: $dir" -ForegroundColor Gray
    }
}

Write-Host "  [OK] Directories ready" -ForegroundColor Green
Write-Host ""

# 3. Настройка Git hooks
Write-Host "[3/7] Configuring Git hooks..." -ForegroundColor Yellow

git config core.hooksPath .githooks
Write-Host "  [OK] Git hooks path configured" -ForegroundColor Green
Write-Host ""

# 4. Создание .env файла
Write-Host "[4/7] Setting up environment variables..." -ForegroundColor Yellow

if (-not (Test-Path ".env")) {
    if (Test-Path ".env.example") {
        Copy-Item ".env.example" ".env"
        Write-Host "  [OK] Created .env from .env.example" -ForegroundColor Green
        Write-Host "  [INFO] Please edit .env with your settings" -ForegroundColor Yellow
    } else {
        Write-Host "  [WARNING] .env.example not found, skipping" -ForegroundColor Yellow
    }
} else {
    Write-Host "  [OK] .env already exists" -ForegroundColor Green
}

Write-Host ""

# 5. Создание pre-commit скриптов
Write-Host "[5/7] Creating pre-commit scripts..." -ForegroundColor Yellow

# Pre-commit для frontend
$frontendHook = @"
#!/bin/sh
# Frontend pre-commit hook

echo "[INFO] Running pre-commit checks for Frontend..."

if [ -d "frontend" ]; then
    cd frontend
    
    npm run lint || exit 1
    npm run format:check || exit 1
    npm run type-check || exit 1
    npm audit --audit-level=moderate || exit 1
    
    echo "[SUCCESS] Frontend checks passed!"
fi
"@

Set-Content -Path ".githooks\pre-commit-frontend" -Value $frontendHook -Encoding UTF8

# Pre-commit для Rust
$rustHook = @"
#!/bin/bash
# Rust pre-commit hook

echo "[INFO] Running pre-commit checks for Rust..."

if [ -d "backend/rust-api" ]; then
    cd backend/rust-api
    
    cargo fmt --check || exit 1
    cargo clippy --all-targets --all-features -- -D warnings || exit 1
    cargo test --lib || exit 1
    cargo audit || exit 1
    
    echo "[SUCCESS] Rust checks passed!"
fi
"@

Set-Content -Path ".githooks\pre-commit-rust" -Value $rustHook -Encoding UTF8

# Pre-commit для Python
$pythonHook = @"
#!/bin/bash
# Python pre-commit hook

echo "[INFO] Running pre-commit checks for Python..."

if [ -d "backend/python-generator" ]; then
    cd backend/python-generator
    
    black --check src/ tests/ || exit 1
    ruff check src/ tests/ || exit 1
    mypy src/ || exit 1
    pytest tests/unit/ --tb=short || exit 1
    pip-audit || exit 1
    
    echo "[SUCCESS] Python checks passed!"
fi
"@

Set-Content -Path ".githooks\pre-commit-python" -Value $pythonHook -Encoding UTF8

Write-Host "  [OK] Pre-commit scripts created" -ForegroundColor Green
Write-Host ""

# 6. Документация
Write-Host "[6/7] Setting up documentation..." -ForegroundColor Yellow

$devSetupDoc = @"
# Руководство по настройке окружения разработки

## Быстрый старт

1. Запустите скрипт настройки:
   ``````powershell
   powershell -ExecutionPolicy Bypass -File scripts/setup-dev.ps1
   ``````

2. Настройте .env файл:
   ``````bash
   # Отредактируйте .env с вашими параметрами
   ``````

3. Установите зависимости проекта:
   ``````bash
   make dev-setup
   ``````

4. Запустите локальное окружение:
   ``````bash
   make up
   ``````

## Pre-commit проверки

Pre-commit хуки запускаются автоматически при каждом коммите и проверяют:

- Линтеры (ESLint, Clippy, Ruff)
- Форматтеры (Prettier, rustfmt, black)
- Type checking (TypeScript, mypy)
- Unit тесты измененных файлов
- Security audits

### Если commit заблокирован:

``````bash
# Автоматическое исправление форматирования
make format

# Ручной запуск проверок
make pre-commit

# После исправления - коммитить снова
git commit
``````

## Полезные команды

``````bash
make test       # Все тесты
make lint       # Все линтеры
make format     # Форматирование кода
make audit      # Security audit
make up         # Запуск окружения
make down       # Остановка окружения
make logs       # Логи сервисов
make help       # Справка
``````

## Структура проекта

``````
TrainingGround/
├── frontend/              # PWA (TypeScript + Web Components)
├── backend/
│   ├── rust-api/         # Rust API (Axum)
│   └── python-generator/ # Python сервис (FastAPI)
├── infra/                # Docker, конфиги, скрипты
├── docs/                 # Документация
├── scripts/              # Утилиты
└── tasks/                # Задачи разработки
``````

## Troubleshooting

### Pre-commit хуки не работают

``````bash
# Проверьте настройку
git config core.hooksPath

# Должно быть: .githooks
# Если нет, выполните:
git config core.hooksPath .githooks
``````

### Ошибки форматирования

``````bash
# Frontend
cd frontend && npm run format

# Rust
cd backend/rust-api && cargo fmt

# Python
cd backend/python-generator && black src/ tests/
``````
"@

if (-not (Test-Path "docs\dev-setup.md")) {
    Set-Content -Path "docs\dev-setup.md" -Value $devSetupDoc -Encoding UTF8
    Write-Host "  [OK] Created docs/dev-setup.md" -ForegroundColor Green
} else {
    Write-Host "  [OK] docs/dev-setup.md already exists" -ForegroundColor Green
}

Write-Host ""

# 7. Финальные инструкции
Write-Host "[7/7] Setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "================================" -ForegroundColor Cyan
Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Edit .env file with your configuration:" -ForegroundColor White
Write-Host "   notepad .env" -ForegroundColor Gray
Write-Host ""
Write-Host "2. Install project dependencies:" -ForegroundColor White
Write-Host "   make dev-setup" -ForegroundColor Gray
Write-Host ""
Write-Host "3. Start local environment:" -ForegroundColor White
Write-Host "   make up" -ForegroundColor Gray
Write-Host ""
Write-Host "4. Read the documentation:" -ForegroundColor White
Write-Host "   docs\dev-setup.md" -ForegroundColor Gray
Write-Host ""
Write-Host "[SUCCESS] Development environment is ready!" -ForegroundColor Green
Write-Host ""
