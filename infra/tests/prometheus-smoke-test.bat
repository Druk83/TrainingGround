@echo off
REM Smoke test для Prometheus metrics scraping (Windows версия)
REM Проверяет доступность метрик и корректность scraping

setlocal enabledelayedexpansion

set "PROMETHEUS_URL=http://localhost:9090"
set "API_URL=http://localhost:8081"
set "TIMEOUT=5"

if not "%1"=="" set "PROMETHEUS_URL=%1"
if not "%2"=="" set "API_URL=%2"

echo Prometheus Smoke Test
echo =====================
echo Prometheus: %PROMETHEUS_URL%
echo API: %API_URL%
echo.

set PASSED=0
set FAILED=0

REM 1. Проверка доступности Prometheus
echo Checking Prometheus health...
curl -sf --max-time %TIMEOUT% "%PROMETHEUS_URL%/-/healthy" >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo   [OK] Prometheus health
    set /a PASSED+=1
) else (
    echo   [FAIL] Prometheus health
    set /a FAILED+=1
)

REM 2. Проверка доступности API metrics endpoint
echo Checking API metrics endpoint...
curl -sf --max-time %TIMEOUT% "%API_URL%/metrics" >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo   [OK] API metrics endpoint
    set /a PASSED+=1
) else (
    echo   [FAIL] API metrics endpoint
    set /a FAILED+=1
)

REM 3. Проверка Prometheus targets
echo Checking Prometheus targets...
curl -sf --max-time %TIMEOUT% "%PROMETHEUS_URL%/api/v1/targets" | findstr /C:"\"health\":\"up\"" >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo   [OK] Prometheus targets
    set /a PASSED+=1
) else (
    echo   [FAIL] Prometheus targets
    set /a FAILED+=1
)

REM 4. Проверка метрик
echo.
echo Checking metrics presence:

call :check_metric "http_requests_total" "HTTP requests total"
call :check_metric "http_request_duration_seconds" "HTTP request duration"
call :check_metric "db_operations_total" "Database operations"
call :check_metric "cache_operations_total" "Cache operations"
call :check_metric "sessions_total" "Sessions total"
call :check_metric "answers_submitted_total" "Answers submitted"
call :check_metric "anticheat_violations_total" "Anticheat violations"

REM 5. Проверка SLA rules
echo.
echo Checking if SLA rules are loaded...
curl -sf --max-time %TIMEOUT% "%PROMETHEUS_URL%/api/v1/rules" | findstr /C:"ApiLatencyP95TooHigh" >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo   [OK] SLA rules loaded
    set /a PASSED+=1
) else (
    echo   [FAIL] SLA rules loaded
    set /a FAILED+=1
)

REM Итоги
echo.
echo =====================
echo Test Results:
echo   Passed: %PASSED%
echo   Failed: %FAILED%
echo.

if %FAILED% equ 0 (
    echo All tests passed!
    exit /b 0
) else (
    echo Some tests failed!
    exit /b 1
)

:check_metric
set "metric=%~1"
set "description=%~2"
echo Checking metric '%metric%'...
curl -sf --max-time %TIMEOUT% "%PROMETHEUS_URL%/api/v1/query?query=%metric%" | findstr /C:"\"status\":\"success\"" >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo   [OK] %description%
    set /a PASSED+=1
) else (
    echo   [FAIL] %description%
    set /a FAILED+=1
)
goto :eof
