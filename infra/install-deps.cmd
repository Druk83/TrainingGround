@echo off
REM Install Python dependencies for infrastructure scripts

echo [INFO] Installing Python dependencies for infrastructure...

python -m pip install --upgrade pip

REM Install dependencies
pip install -r infra\requirements.txt

if %ERRORLEVEL% EQU 0 (
    echo [SUCCESS] Infrastructure dependencies installed
) else (
    echo [ERROR] Failed to install dependencies
    exit /b 1
)

echo.
echo Dependencies installed:
echo   - qdrant-client (Qdrant vector DB)
echo   - pymongo (MongoDB client)
echo   - redis (Redis client)
echo   - boto3 (Yandex Object Storage)
echo.
echo You can now run infrastructure scripts:
echo   python infra\qdrant\init_collections.py
echo   python infra\scripts\changestream_bridge.py
