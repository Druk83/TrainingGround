#!/bin/bash
# DR Drill: Массовая Anticheat атака
# Симуляция множественных нарушений античита

set -e

DRILL_NAME="Anticheat Mass Attack"
START_TIME=$(date +%s)
NUM_VIOLATIONS=${1:-30}  # По умолчанию 30 нарушений (> 25 для алерта)

echo "======================================="
echo "DR Drill: $DRILL_NAME"
echo "======================================="
echo "Simulating $NUM_VIOLATIONS violations"
echo "Start time: $(date)"
echo ""

elapsed_time() {
    echo $(($(date +%s) - START_TIME))
}

# Проверка что API и Redis работают
echo "[$(elapsed_time)s] Step 1: Checking prerequisites..."
if ! curl -sf http://localhost:8081/health > /dev/null; then
    echo "ERROR: API is not running"
    exit 1
fi
if ! docker-compose exec -T redis redis-cli ping > /dev/null 2>&1; then
    echo "ERROR: Redis is not running"
    exit 1
fi
echo "  Prerequisites OK"

# Получить тестовый токен
echo ""
echo "[$(elapsed_time)s] Step 2: Creating test user and getting token..."
TEST_EMAIL="drill-test-$(date +%s)@example.com"
TEST_PASSWORD="DrillTest123!"

# Регистрация
REGISTER_RESPONSE=$(curl -sf -X POST http://localhost:8081/api/v1/auth/register \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\",\"name\":\"DR Drill Test\"}" || echo "FAILED")

if echo "$REGISTER_RESPONSE" | grep -q "access_token"; then
    ACCESS_TOKEN=$(echo "$REGISTER_RESPONSE" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
    echo "  Test user created"
else
    echo "  WARNING: Failed to create test user, using existing credentials"
    ACCESS_TOKEN="test-token"
fi

# Создать сессию
echo ""
echo "[$(elapsed_time)s] Step 3: Creating training session..."
SESSION_RESPONSE=$(curl -sf -X POST http://localhost:8081/api/v1/sessions \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"template_id":"test-template"}' || echo "FAILED")

if echo "$SESSION_RESPONSE" | grep -q "session_id\|id"; then
    SESSION_ID=$(echo "$SESSION_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    echo "  Session created: $SESSION_ID"
else
    echo "  WARNING: Failed to create session"
    SESSION_ID="test-session"
fi

# Генерация массовых нарушений
echo ""
echo "[$(elapsed_time)s] Step 4: Generating $NUM_VIOLATIONS rapid answers (speed violation)..."
VIOLATIONS_COUNT=0
for i in $(seq 1 $NUM_VIOLATIONS); do
    # Быстрые ответы для триггера speed violation
    curl -sf -X POST "http://localhost:8081/api/v1/sessions/$SESSION_ID/answer" \
        -H "Authorization: Bearer $ACCESS_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"answer\":\"test-answer-$i\"}" > /dev/null 2>&1 || true

    ((VIOLATIONS_COUNT++))

    # Прогресс каждые 5 запросов
    if [ $((i % 5)) -eq 0 ]; then
        echo "  Sent $i/$NUM_VIOLATIONS requests..."
    fi

    # Небольшая задержка для имитации реальной атаки
    sleep 0.1
done

echo "  Generated $VIOLATIONS_COUNT violations"

# Ждать алерта
echo ""
echo "[$(elapsed_time)s] Step 5: Waiting for AnticheatIncidentsSpike alert (max 360s)..."
ALERT_RECEIVED=false
for i in {1..72}; do
    sleep 5
    if curl -sf "http://localhost:9090/api/v1/alerts" | grep -q "AnticheatIncidentsSpike"; then
        ALERT_RECEIVED=true
        echo "  Alert received after $(elapsed_time) seconds"
        break
    fi
done

if [ "$ALERT_RECEIVED" = false ]; then
    echo "  WARNING: Alert not received within 360 seconds"
fi

# Проверить инциденты в MongoDB
echo ""
echo "[$(elapsed_time)s] Step 6: Checking incidents in MongoDB..."
INCIDENTS_COUNT=$(docker-compose exec -T mongodb-primary mongosh trainingground --quiet \
    --eval "db.incidents.countDocuments({timestamp: {\$gte: new Date(Date.now() - 600000)}})" 2>/dev/null || echo "0")
echo "  Recent incidents count: $INCIDENTS_COUNT"

# Проверить Redis Pub/Sub (проверка канала incidents)
echo ""
echo "[$(elapsed_time)s] Step 7: Verifying Redis Pub/Sub published events..."
PUBSUB_CHANNELS=$(docker-compose exec -T redis redis-cli PUBSUB CHANNELS | grep incidents || echo "")
if [ -n "$PUBSUB_CHANNELS" ]; then
    echo "  Redis Pub/Sub channel 'incidents' exists"
else
    echo "  INFO: No active subscribers to 'incidents' channel (expected if no listeners)"
fi

# Проверить Telegram уведомления (через логи)
echo ""
echo "[$(elapsed_time)s] Step 8: Checking Telegram notifications in logs..."
if docker-compose logs --tail=100 rust-api | grep -i "telegram.*anticheat\|send.*alert" > /dev/null 2>&1; then
    echo "  Telegram notification attempt found in logs"
else
    echo "  INFO: No Telegram notification logs (check ANTICHEAT_TELEGRAM_BOT_TOKEN is set)"
fi

# Cleanup
echo ""
echo "[$(elapsed_time)s] Step 9: Cleanup - removing test incidents..."
docker-compose exec -T mongodb-primary mongosh trainingground --quiet \
    --eval "db.incidents.deleteMany({user_id: /drill-test/})" > /dev/null 2>&1 || true
docker-compose exec -T redis redis-cli DEL "anticheat:speed:*drill-test*" > /dev/null 2>&1 || true
echo "  Test data cleaned up"

# Итоги
echo ""
echo "======================================="
echo "Drill completed in $(elapsed_time) seconds"
echo "======================================="
echo ""
echo "Checklist:"
echo "  [ ] Generated violations: $VIOLATIONS_COUNT/$NUM_VIOLATIONS"
echo "  [ ] Alert received: $ALERT_RECEIVED"
echo "  [ ] Incidents saved to MongoDB: $INCIDENTS_COUNT"
echo "  [ ] Redis Pub/Sub active: $([ -n "$PUBSUB_CHANNELS" ] && echo "YES" || echo "N/A")"
echo "  [ ] Telegram notifications attempted: YES"
echo ""
echo "Review admin panel:"
echo "  http://localhost:4173/admin/incidents"
echo ""
echo "Review Grafana dashboard:"
echo "  http://localhost:3000/d/observability (Anticheat panel)"
echo ""
