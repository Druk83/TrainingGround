#!/bin/bash
# OWASP ZAP Security Scan - Local Runner
# Запуск ZAP сканера против локального или удаленного окружения

set -e

TARGET_URL="${1:-http://localhost:8081}"
SCAN_TYPE="${2:-baseline}"  # baseline, full, api
REPORT_DIR="./security-reports"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo "======================================="
echo "OWASP ZAP Security Scan"
echo "======================================="
echo "Target: $TARGET_URL"
echo "Scan type: $SCAN_TYPE"
echo "Report dir: $REPORT_DIR"
echo ""

# Создать директорию для отчетов
mkdir -p "$REPORT_DIR"

# Проверка доступности цели
echo "Step 1: Checking target availability..."
if ! curl -sf --max-time 10 "$TARGET_URL/health" > /dev/null 2>&1; then
    echo "WARNING: Target $TARGET_URL/health is not accessible"
    echo "Make sure the application is running"
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
else
    echo "  Target is accessible"
fi

# Проверка Docker
echo ""
echo "Step 2: Checking Docker..."
if ! docker --version > /dev/null 2>&1; then
    echo "ERROR: Docker is not installed or not running"
    exit 1
fi
echo "  Docker is available"

# Функция запуска baseline scan
run_baseline_scan() {
    echo ""
    echo "Step 3: Running ZAP Baseline Scan..."
    echo "  This will take 5-10 minutes..."

    docker run --rm \
        -v "$(pwd):/zap/wrk:rw" \
        -v "$(pwd)/.zap:/zap/config:ro" \
        --network host \
        ghcr.io/zaproxy/zaproxy:stable \
        zap-baseline.py \
        -t "$TARGET_URL" \
        -c /zap/config/rules.tsv \
        -r "$REPORT_DIR/zap-baseline-${TIMESTAMP}.html" \
        -J "$REPORT_DIR/zap-baseline-${TIMESTAMP}.json" \
        -a \
        -j \
        -m 5 \
        -T 30 || true

    echo ""
    echo "Baseline scan completed"
}

# Функция запуска full scan
run_full_scan() {
    echo ""
    echo "Step 3: Running ZAP Full Scan..."
    echo "  WARNING: This can take 30-60 minutes..."
    echo "  Full scan includes active attacks!"

    read -p "Continue with full scan? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Full scan cancelled"
        return
    fi

    docker run --rm \
        -v "$(pwd):/zap/wrk:rw" \
        -v "$(pwd)/.zap:/zap/config:ro" \
        --network host \
        ghcr.io/zaproxy/zaproxy:stable \
        zap-full-scan.py \
        -t "$TARGET_URL" \
        -c /zap/config/rules.tsv \
        -r "$REPORT_DIR/zap-full-${TIMESTAMP}.html" \
        -J "$REPORT_DIR/zap-full-${TIMESTAMP}.json" \
        -a \
        -j \
        -m 5 \
        -T 60 || true

    echo ""
    echo "Full scan completed"
}

# Функция запуска API scan
run_api_scan() {
    echo ""
    echo "Step 3: Running ZAP API Scan..."

    # Проверка наличия OpenAPI spec
    OPENAPI_SPEC="${OPENAPI_SPEC:-docs/admin-openapi.yaml}"
    if [ ! -f "$OPENAPI_SPEC" ]; then
        echo "ERROR: OpenAPI spec not found at $OPENAPI_SPEC"
        echo "Set OPENAPI_SPEC environment variable to the correct path"
        exit 1
    fi

    docker run --rm \
        -v "$(pwd):/zap/wrk:rw" \
        -v "$(pwd)/.zap:/zap/config:ro" \
        --network host \
        ghcr.io/zaproxy/zaproxy:stable \
        zap-api-scan.py \
        -t "$TARGET_URL" \
        -f openapi \
        -O "/zap/wrk/$OPENAPI_SPEC" \
        -c /zap/config/rules.tsv \
        -r "$REPORT_DIR/zap-api-${TIMESTAMP}.html" \
        -J "$REPORT_DIR/zap-api-${TIMESTAMP}.json" \
        -a \
        -j || true

    echo ""
    echo "API scan completed"
}

# Запуск соответствующего типа сканирования
case "$SCAN_TYPE" in
    baseline)
        run_baseline_scan
        ;;
    full)
        run_full_scan
        ;;
    api)
        run_api_scan
        ;;
    *)
        echo "ERROR: Unknown scan type: $SCAN_TYPE"
        echo "Valid types: baseline, full, api"
        exit 1
        ;;
esac

# Вывод результатов
echo ""
echo "======================================="
echo "Scan Results"
echo "======================================="
echo ""

# Найти последние отчеты
LATEST_HTML=$(find "$REPORT_DIR" -name "zap-*-${TIMESTAMP}.html" -type f | head -1)
LATEST_JSON=$(find "$REPORT_DIR" -name "zap-*-${TIMESTAMP}.json" -type f | head -1)

if [ -n "$LATEST_HTML" ]; then
    echo "HTML Report: $LATEST_HTML"
fi

if [ -n "$LATEST_JSON" ]; then
    echo "JSON Report: $LATEST_JSON"
    echo ""
    echo "Summary from JSON:"

    # Попытка извлечь статистику из JSON
    if command -v jq > /dev/null 2>&1; then
        ALERTS=$(jq -r '.site[0].alerts | length' "$LATEST_JSON" 2>/dev/null || echo "N/A")
        HIGH=$(jq -r '[.site[0].alerts[] | select(.riskcode == "3")] | length' "$LATEST_JSON" 2>/dev/null || echo "0")
        MEDIUM=$(jq -r '[.site[0].alerts[] | select(.riskcode == "2")] | length' "$LATEST_JSON" 2>/dev/null || echo "0")
        LOW=$(jq -r '[.site[0].alerts[] | select(.riskcode == "1")] | length' "$LATEST_JSON" 2>/dev/null || echo "0")
        INFO=$(jq -r '[.site[0].alerts[] | select(.riskcode == "0")] | length' "$LATEST_JSON" 2>/dev/null || echo "0")

        echo "  Total Alerts: $ALERTS"
        echo "  High Risk: $HIGH"
        echo "  Medium Risk: $MEDIUM"
        echo "  Low Risk: $LOW"
        echo "  Informational: $INFO"
    else
        echo "  (Install jq to see detailed statistics)"
    fi
fi

echo ""
echo "Open HTML report to review findings:"
if [ -n "$LATEST_HTML" ]; then
    case "$(uname -s)" in
        Linux*)
            echo "  xdg-open $LATEST_HTML"
            ;;
        Darwin*)
            echo "  open $LATEST_HTML"
            ;;
        MINGW*|MSYS*|CYGWIN*)
            echo "  start $LATEST_HTML"
            ;;
    esac
fi

echo ""
echo "Done!"
