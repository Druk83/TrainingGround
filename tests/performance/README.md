# K6‑тесты производительности для Rust API

## Требования
- **k6**: `winget install k6` или `choco install k6`
- Rust API должен быть поднят: `docker compose up -d rust-api`
- Тесты ожидают API по адресу `http://localhost:8081`

## Запуск тестов

### 1. Answers (500 rps, SLA p95 ≤ 200 мс)
Прогоняет `POST /sessions/{id}/answers` при высокой нагрузке:

```bash
k6 run tests/performance/answers.js
```

Параметры:
- 100 VUs (виртуальных пользователей)
- Длительность 3 минуты (30 с разгон, 2 мин плато, 30 с сброс)
- Ожидаемое RPS ≈ 500
- SLA: p95 < 200 мс

Полезные опции:
```bash
# другой URL
k6 run -e BASE_URL=http://api.example.com tests/performance/answers.js

# другой JWT
k6 run -e JWT_TOKEN=... tests/performance/answers.js
```

### 2. Hints (50 rps)
Нагрузка на `POST /sessions/{id}/hints`:

```bash
k6 run tests/performance/hints.js
```

Параметры:
- 10 VUs
- 1.5 минуты
- RPS ≈ 50
- SLA: p95 < 300 мс

### 3. SSE (10 соединений)
Тестирует `GET /sessions/{id}/stream`:

```bash
k6 run tests/performance/sse.js
```

Параметры:
- 10 одновременных SSE‑соединений
- Длительность 1 минута
- Ожидаемые события: `timer-tick`, `time-expired`

## Быстрый запуск всех тестов

```powershell
# Windows PowerShell
foreach ($test in @("answers", "hints", "sse")) {
    Write-Host "Running $test test..."
    k6 run "tests/performance/$test.js"
}

# Windows CMD
for %t in (answers hints sse) do k6 run tests\performance\%t.js
```

## Метрики SLA

- **http_req_duration (p95)**: < 200 мс для answers, < 300 мс для hints
- **http_req_failed**: < 1 %
- **errors**: < 1 %

Пример «здоровых» значений:
```
  http_req_duration..........: avg=45ms  min=12ms med=38ms max=185ms p(95)=120ms
  http_req_failed............: 0.05%
  errors.....................: 0.03%
```

Если p95 > 200 мс, ищите узкие места в API. Если http_req_failed > 1 %, значит сервис возвращает ошибки (500/4xx). Если errors > 1 %, подписка кастомных чеков выявила сбои.

## Подготовка окружения

1. **MongoDB**: добавьте тестовый task.
   ```bash
   docker exec -it trainingground-mongodb mongosh -u ${MONGO_USER:-admin} -p ${MONGO_PASSWORD:-password} --authenticationDatabase admin \
     --eval "use trainingground; db.tasks.updateOne({_id:'task-1'},{\$set:{correct_answer:'correct_answer',static_hint:'Test hint'}},{upsert:true})"
   ```
2. **Redis**: очистите состояние.
   ```bash
  docker exec -it trainingground-redis redis-cli -a ${REDIS_PASSWORD:-redispass} FLUSHDB
   ```
3. **JWT**: используйте валидный токен (можно стаб из README).

## Интеграция в CI/CD

Пример job’а:

```yaml
# .github/workflows/performance.yml
- name: Run k6 Performance Tests
  run: |
    docker compose up -d rust-api
    k6 run --out json=results_answers.json tests/performance/answers.js
    k6 run tests/performance/hints.js
    k6 run tests/performance/sse.js
  env:
    BASE_URL: http://localhost:8081
```

## Troubleshooting

**connection refused**
- проверьте `docker compose ps`
- убедитесь, что `curl http://localhost:8081/health` возвращает `healthy`

**401 Unauthorized**
- передайте валидный JWT: `k6 run -e JWT_TOKEN=...`
- проверьте конфиг Auth middleware

**RPS < 500**
- увеличьте VUs (`--vus 150`)
- поднимите лимит дескрипторов (`ulimit -n 4096`)

## Авто‑скрипты

### Smoke

`scripts/run_smoke.bat` или `.ps1`:
- чистят Redis
- сидируют task-1
- запускают k6 smoke‑тест
- сохраняют JSON в `tests/performance/results_smoke.json`
- выгружают логи API в `tests/performance/rust-api-logs.txt`

### Полный прогон

`scripts/run_performance.bat` / `.ps1`:
- поднимают Mongo/Redis/Rust API
- ждут health‑чек
- чистят Redis и сидируют Mongo
- запускают ответы, подсказки и SSE последовательно
- собирают результаты (`tests/performance/`) и логи

Можно запускать тесты вручную:
```cmd
k6 run tests\performance\answers.js
k6 run tests\performance\hints.js
k6 run tests\performance\sse.js
```

### Повторный запуск без очистки

По умолчанию скрипт удаляет старые результаты (переменная `CLEAN=1`). Чтобы сохранить артефакты, перед запуском установите `set CLEAN=0`.
