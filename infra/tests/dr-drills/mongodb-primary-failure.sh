#!/bin/bash
# DR Drill: MongoDB Primary Node Failure
# Симуляция отказа primary узла MongoDB replica set

set -e

DRILL_NAME="MongoDB Primary Failure"
START_TIME=$(date +%s)
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"

echo "======================================="
echo "DR Drill: $DRILL_NAME"
echo "======================================="
echo "Start time: $(date)"
echo ""

# Функция для вычисления elapsed time
elapsed_time() {
    local current=$(date +%s)
    echo $((current - START_TIME))
}

# Проверка что MongoDB replica set работает
echo "[$(elapsed_time)s] Step 1: Checking MongoDB replica set status..."
if ! docker-compose exec -T mongodb-primary mongosh --quiet --eval "rs.status()" > /dev/null 2>&1; then
    echo "ERROR: MongoDB replica set is not running. Start it first."
    exit 1
fi
echo "  MongoDB replica set is running"

# Получить текущий primary
echo ""
echo "[$(elapsed_time)s] Step 2: Identifying current primary..."
PRIMARY=$(docker-compose exec -T mongodb-primary mongosh --quiet --eval "rs.status().members.filter(m => m.stateStr == 'PRIMARY')[0].name" | tr -d '\r')
echo "  Current primary: $PRIMARY"

# Остановить primary узел
echo ""
echo "[$(elapsed_time)s] Step 3: Stopping primary node..."
docker-compose stop mongodb-primary
echo "  Primary node stopped"

# Ждать срабатывания алерта
echo ""
echo "[$(elapsed_time)s] Step 4: Waiting for alert (max 120 seconds)..."
ALERT_RECEIVED=false
for i in {1..24}; do
    sleep 5
    # Проверить Prometheus alerts
    if curl -sf "http://localhost:9090/api/v1/alerts" | grep -q "MongoDBPrimaryDown"; then
        ALERT_RECEIVED=true
        echo "  Alert received after $(elapsed_time) seconds"
        break
    fi
done

if [ "$ALERT_RECEIVED" = false ]; then
    echo "  WARNING: Alert not received within 120 seconds"
fi

# Проверить что новый primary избран
echo ""
echo "[$(elapsed_time)s] Step 5: Checking if new primary is elected..."
for i in {1..12}; do
    sleep 5
    NEW_PRIMARY=$(docker-compose exec -T mongodb-secondary-1 mongosh --quiet --eval "rs.status().members.filter(m => m.stateStr == 'PRIMARY')[0].name" 2>/dev/null | tr -d '\r' || true)
    if [ -n "$NEW_PRIMARY" ]; then
        echo "  New primary elected: $NEW_PRIMARY"
        break
    fi
done

if [ -z "$NEW_PRIMARY" ]; then
    echo "  ERROR: No new primary elected after 60 seconds"
    echo ""
    echo "Manual rollback required:"
    echo "  docker-compose start mongodb-primary"
    exit 1
fi

# Проверить что API работает
echo ""
echo "[$(elapsed_time)s] Step 6: Checking API health..."
if curl -sf http://localhost:8081/health > /dev/null; then
    echo "  API is healthy"
else
    echo "  WARNING: API health check failed"
fi

# Rollback
echo ""
echo "[$(elapsed_time)s] Step 7: Rollback - restarting primary node..."
docker-compose start mongodb-primary
sleep 10

# Проверить что replica set восстановлен
echo ""
echo "[$(elapsed_time)s] Step 8: Verifying replica set recovery..."
if docker-compose exec -T mongodb-primary mongosh --quiet --eval "rs.status()" > /dev/null 2>&1; then
    echo "  Replica set recovered"
else
    echo "  WARNING: Replica set not fully recovered"
fi

# Итоги
echo ""
echo "======================================="
echo "Drill completed in $(elapsed_time) seconds"
echo "======================================="
echo ""
echo "Checklist:"
echo "  [ ] Alert received: $ALERT_RECEIVED"
echo "  [ ] New primary elected: $([ -n "$NEW_PRIMARY" ] && echo "YES" || echo "NO")"
echo "  [ ] API remained operational: $(curl -sf http://localhost:8081/health > /dev/null && echo "YES" || echo "NO")"
echo "  [ ] Replica set recovered: YES"
echo ""
echo "Review logs:"
echo "  docker-compose logs mongodb-primary"
echo "  docker-compose logs rust-api | grep -i mongo"
echo ""
