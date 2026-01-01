@echo off
REM Run Template Generator Tests
REM Default: Unit tests only (for pre-commit)
REM Usage: run_tests.bat          # Unit tests
REM        run_tests.bat --all    # All tests
REM        run_tests.bat --integration  # Integration tests only

cd /d "%~dp0"

if "%1"=="" (
    echo Running UNIT tests only...
    python -m pytest tests/ -v --tb=short -m "not (integration or performance)"
) else if "%1"=="--all" (
    echo Running ALL tests...
    python -m pytest tests/ -v --tb=short
) else if "%1"=="--integration" (
    echo Running INTEGRATION tests only...
    python -m pytest tests/ -v --tb=short -m "integration"
) else if "%1"=="--performance" (
    echo Running PERFORMANCE tests only...
    python -m pytest tests/ -v --tb=short -m "performance"
) else (
    python -m pytest tests/ -v --tb=short %*
)

pause

