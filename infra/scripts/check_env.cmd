@echo off
setlocal enabledelayedexpansion

set "ROOT_DIR=%~dp0..\.."
set "ENV_FILE=%ROOT_DIR%\.env"

echo Checking essential environment variables...

set WARNINGS=0
set ERRORS=0

REM Load .env file
if not exist "%ENV_FILE%" (
    echo [ERROR] .env file not found at %ENV_FILE%
    echo Run: copy .env.example .env
    echo Then: powershell -ExecutionPolicy Bypass -File infra\scripts\generate_secrets.ps1
    exit /b 1
)

REM Check each required variable
call :check_var MONGO_USER
call :check_var MONGO_PASSWORD
call :check_var REDIS_PASSWORD
call :check_var JWT_SECRET
call :check_var QDRANT_API_KEY
call :check_var GRAFANA_PASSWORD

goto :summary

:check_var
set "VAR_NAME=%~1"
set "VAR_VALUE="

REM Read variable from .env file
for /f "usebackq tokens=1,* delims==" %%a in ("%ENV_FILE%") do (
    if "%%a"=="%VAR_NAME%" set "VAR_VALUE=%%b"
)

if not defined VAR_VALUE (
    echo [ERROR] %VAR_NAME% is not set in %ENV_FILE%
    set /a ERRORS+=1
    exit /b
)

REM Check for weak passwords - inline check
set "IS_WEAK=0"
if "!VAR_VALUE!"=="admin" set "IS_WEAK=1"
if "!VAR_VALUE!"=="password" set "IS_WEAK=1"
if "!VAR_VALUE!"=="redispass" set "IS_WEAK=1"
if "!VAR_VALUE!"=="your-secret-key-change-in-prod" set "IS_WEAK=1"
if "!VAR_VALUE!"=="qdrantkey" set "IS_WEAK=1"
if "!VAR_VALUE!"=="changeme" set "IS_WEAK=1"
if "!VAR_VALUE!"=="changeMe" set "IS_WEAK=1"
if "!VAR_VALUE!"=="changeMe123" set "IS_WEAK=1"

if "!IS_WEAK!"=="1" (
    echo [WARN] %VAR_NAME% is set to weak/default value in %ENV_FILE%
    set /a WARNINGS+=1
    exit /b
)

REM Check length using PowerShell for accuracy
for /f %%i in ('powershell -Command "('%VAR_VALUE%').Length"') do set VAR_LENGTH=%%i

if !VAR_LENGTH! lss 12 (
    echo [WARN] %VAR_NAME% is too short ^(!VAR_LENGTH! chars, minimum 12^)
    set /a WARNINGS+=1
) else (
    echo [OK] %VAR_NAME% is set securely
)
exit /b

:summary
echo.
echo ==========================================
echo Check complete: %ERRORS% errors, %WARNINGS% warnings
echo ==========================================

if %ERRORS% gtr 0 (
    echo [ERROR] FATAL: Required environment variables are missing!
    echo Run: copy .env.example .env
    echo Then: powershell -ExecutionPolicy Bypass -File infra\scripts\generate_secrets.ps1
    exit /b 1
) else if %WARNINGS% gtr 0 (
    echo [WARN] WARNING: Weak passwords detected!
    echo Generate strong passwords: powershell -ExecutionPolicy Bypass -File infra\scripts\generate_secrets.ps1
    exit /b 0
) else (
    echo [OK] All environment variables are set securely
    exit /b 0
)
