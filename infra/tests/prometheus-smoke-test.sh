#!/bin/bash
# Smoke test для Prometheus metrics scraping
# Проверяет доступность метрик и корректность scraping

set -e

PROMETHEUS_URL="${PROMETHEUS_URL:-http://localhost:9090}"
API_URL="${API_URL:-http://localhost:8081}"
TIMEOUT=5

echo "Prometheus Smoke Test"
echo "====================="
echo "Prometheus: $PROMETHEUS_URL"
echo "API: $API_URL"
echo ""

# Функция проверки HTTP endpoint
check_endpoint() {
    local url=$1
    local description=$2

    echo -n "Checking $description... "
    if curl -sf --max-time $TIMEOUT "$url" > /dev/null; then
        echo "OK"
        return 0
    else
        echo "FAIL"
        return 1
    fi
}

# Функция проверки метрики в Prometheus
check_metric() {
    local metric=$1
    local description=$2

    echo -n "Checking metric '$metric'... "
    local query_url="${PROMETHEUS_URL}/api/v1/query?query=${metric}"
    local response=$(curl -sf --max-time $TIMEOUT "$query_url")

    if echo "$response" | grep -q '"status":"success"'; then
        local result_count=$(echo "$response" | grep -o '"result":\[' | wc -l)
        if [ "$result_count" -gt 0 ]; then
            echo "OK"
            return 0
        else
            echo "WARN (no data)"
            return 1
        fi
    else
        echo "FAIL"
        return 1
    fi
}

# Счетчики
PASSED=0
FAILED=0

# 1. Проверка доступности Prometheus
if check_endpoint "${PROMETHEUS_URL}/-/healthy" "Prometheus health"; then
    ((PASSED++))
else
    ((FAILED++))
fi

# 2. Проверка доступности API metrics endpoint
if check_endpoint "${API_URL}/metrics" "API metrics endpoint"; then
    ((PASSED++))
else
    ((FAILED++))
fi

# 3. Проверка доступности Prometheus targets
echo -n "Checking Prometheus targets... "
TARGETS_URL="${PROMETHEUS_URL}/api/v1/targets"
TARGETS_RESPONSE=$(curl -sf --max-time $TIMEOUT "$TARGETS_URL")
if echo "$TARGETS_RESPONSE" | grep -q '"health":"up"'; then
    echo "OK"
    ((PASSED++))
else
    echo "FAIL"
    ((FAILED++))
fi

# 4. Проверка базовых метрик
echo ""
echo "Checking metrics presence:"

# HTTP metrics
if check_metric "http_requests_total" "HTTP requests total"; then
    ((PASSED++))
else
    ((FAILED++))
fi

if check_metric "http_request_duration_seconds" "HTTP request duration"; then
    ((PASSED++))
else
    ((FAILED++))
fi

# Database metrics
if check_metric "db_operations_total" "Database operations"; then
    ((PASSED++))
else
    ((FAILED++))
fi

# Cache metrics
if check_metric "cache_operations_total" "Cache operations"; then
    ((PASSED++))
else
    ((FAILED++))
fi

# Business metrics
if check_metric "sessions_total" "Sessions total"; then
    ((PASSED++))
else
    ((FAILED++))
fi

if check_metric "answers_submitted_total" "Answers submitted"; then
    ((PASSED++))
else
    ((FAILED++))
fi

# Anticheat metrics
if check_metric "anticheat_violations_total" "Anticheat violations"; then
    ((PASSED++))
else
    ((FAILED++))
fi

# 5. Проверка SLA rules загружены
echo ""
echo -n "Checking if SLA rules are loaded... "
RULES_URL="${PROMETHEUS_URL}/api/v1/rules"
RULES_RESPONSE=$(curl -sf --max-time $TIMEOUT "$RULES_URL")
if echo "$RULES_RESPONSE" | grep -q "ApiLatencyP95TooHigh"; then
    echo "OK"
    ((PASSED++))
else
    echo "FAIL"
    ((FAILED++))
fi

# Итоги
echo ""
echo "====================="
echo "Test Results:"
echo "  Passed: $PASSED"
echo "  Failed: $FAILED"
echo ""

if [ $FAILED -eq 0 ]; then
    echo "All tests passed!"
    exit 0
else
    echo "Some tests failed!"
    exit 1
fi
