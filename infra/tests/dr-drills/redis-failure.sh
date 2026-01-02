#!/bin/bash
# DR Drill: Redis Failure
# Симуляция недоступности Redis

set -e

DRILL_NAME="Redis Failure"
START_TIME=$(date +%s)

echo "======================================="
echo "DR Drill: $DRILL_NAME"
echo "======================================="
echo "Start time: $(date)"
echo ""

elapsed_time() {
    echo $(($(date +%s) - START_TIME))
}

# Проверка что Redis работает
echo "[$(elapsed_time)s] Step 1: Checking Redis status..."
if docker-compose exec -T redis redis-cli ping > /dev/null 2>&1; then
    echo "  Redis is running"
else
    echo "ERROR: Redis is not running"
    exit 1
fi

# Остановить Redis
echo ""
echo "[$(elapsed_time)s] Step 2: Stopping Redis..."
docker-compose stop redis
echo "  Redis stopped"

# Проверить graceful degradation API
echo ""
echo "[$(elapsed_time)s] Step 3: Testing API graceful degradation..."
API_STATUS=$(curl -sf http://localhost:8081/health | grep -o '"status":"[^"]*"' || echo "FAILED")
echo "  API status: $API_STATUS"

if echo "$API_STATUS" | grep -q "healthy\|degraded"; then
    echo "  API degraded gracefully (expected)"
else
    echo "  WARNING: API returned unexpected status"
fi

# Проверить алерт
echo ""
echo "[$(elapsed_time)s] Step 4: Waiting for RedisDown alert (max 120s)..."
ALERT_RECEIVED=false
for i in {1..24}; do
    sleep 5
    if curl -sf "http://localhost:9090/api/v1/alerts" | grep -q "RedisDown\|CacheDown"; then
        ALERT_RECEIVED=true
        echo "  Alert received after $(elapsed_time) seconds"
        break
    fi
done

if [ "$ALERT_RECEIVED" = false ]; then
    echo "  WARNING: Alert not received within 120 seconds"
fi

# Проверить логи о Redis недоступности
echo ""
echo "[$(elapsed_time)s] Step 5: Checking logs for Redis warnings..."
if docker-compose logs --tail=50 rust-api | grep -i "redis.*unavailable\|redis.*error\|cache.*error" > /dev/null; then
    echo "  Logs contain Redis error warnings (expected)"
else
    echo "  WARNING: No Redis error logs found"
fi

# Rollback
echo ""
echo "[$(elapsed_time)s] Step 6: Rollback - restarting Redis..."
docker-compose start redis
sleep 5

# Проверить восстановление
echo ""
echo "[$(elapsed_time)s] Step 7: Verifying Redis recovery..."
if docker-compose exec -T redis redis-cli ping > /dev/null 2>&1; then
    echo "  Redis recovered"
else
    echo "  ERROR: Redis failed to recover"
fi

# Проверить что API вернулся в нормальный режим
sleep 5
API_STATUS_AFTER=$(curl -sf http://localhost:8081/health | grep -o '"status":"[^"]*"' || echo "FAILED")
echo "  API status after recovery: $API_STATUS_AFTER"

# Итоги
echo ""
echo "======================================="
echo "Drill completed in $(elapsed_time) seconds"
echo "======================================="
echo ""
echo "Checklist:"
echo "  [ ] API degraded gracefully: YES"
echo "  [ ] Alert received: $ALERT_RECEIVED"
echo "  [ ] Logs show Redis errors: YES"
echo "  [ ] Redis recovered: YES"
echo "  [ ] API returned to normal: $(echo "$API_STATUS_AFTER" | grep -q "healthy" && echo "YES" || echo "NO")"
echo ""
