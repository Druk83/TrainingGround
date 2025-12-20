@echo off
REM Development commands for Windows

if "%1"=="" goto help
if "%1"=="up" goto up
if "%1"=="down" goto down
if "%1"=="logs" goto logs
if "%1"=="test" goto test
if "%1"=="check" goto check
if "%1"=="lint" goto lint
if "%1"=="format" goto format
if "%1"=="audit" goto audit
goto help

:up
echo Starting all services...
docker-compose up -d
goto end

:down
echo Stopping all services...
docker-compose down
goto end

:logs
echo Showing logs...
docker-compose logs -f
goto end

:test
echo Running infrastructure tests...
cd infra\tests && npm test
cd ..\..
goto end

:check
echo [INFO] Running pre-commit checks...
echo.
echo [1/3] Testing Redis Lua scripts...
cd infra\tests
call npm test
if errorlevel 1 (
    echo [ERROR] Tests failed!
    cd ..\..
    exit /b 1
)
cd ..\..
echo.
echo [2/3] Checking Docker services...
docker-compose ps
echo.
echo [3/3] Git status...
git status --short
echo.
echo [SUCCESS] All pre-commit checks passed! Ready to commit.
goto end

:lint
echo Running linters...
cd frontend && npm run lint
cd ..\backend\rust-api && cargo clippy -- -D warnings
cd ..\backend\python-generator && ruff check src/ tests/
echo Commands:
echo   up       Start all services (Docker Compose)
echo   down     Stop all services
echo   logs     Show service logs
echo   test     Run infrastructure tests
echo   check    Run pre-commit checks
echo   lint     Run all linters
echo   format   Format all code
echo   audit    Run security audits
echo.
:audit
echo Running security audits...
cd frontend && npm audit
cd ..\backend\rust-api && cargo audit
cd ..\backend\python-generator && pip-audit
goto end

:help
echo TrainingGround Development Commands
echo.
echo Usage: dev.cmd [command]
echo.
echo Commands:
echo   up       Start all services (Docker Compose)
echo   down     Stop all services
echo   logs     Show service logs
echo   test     Run all tests
echo   lint     Run all linters
echo   format   Format all code
echo   audit    Run security audits
echo.
goto end

:end
