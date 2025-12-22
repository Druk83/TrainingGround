@echo off
setlocal

set "SCRIPT_DIR=%~dp0"

rem Allow overriding bash path via BASH_EXE env variable
set "BASH_CMD=%BASH_EXE%"

if not defined BASH_CMD if exist "%ProgramFiles%\Git\bin\bash.exe" (
    set "BASH_CMD=%ProgramFiles%\Git\bin\bash.exe"
)

if not defined BASH_CMD if exist "%ProgramFiles(x86)%\Git\bin\bash.exe" (
    set "BASH_CMD=%ProgramFiles(x86)%\Git\bin\bash.exe"
)

if not defined BASH_CMD (
    for /f "delims=" %%I in ('where bash 2^>nul') do (
        set "BASH_CMD=%%~I"
        goto :found_bash
    )
)

:found_bash
if not defined BASH_CMD (
    echo [ERROR] Unable to locate bash.exe.
    echo Set BASH_EXE env var or install Git Bash.
    endlocal & exit /b 1
)

"%BASH_CMD%" "%SCRIPT_DIR%pre-commit.sh" %*
set "EXIT_CODE=%ERRORLEVEL%"
endlocal & exit /b %EXIT_CODE%
