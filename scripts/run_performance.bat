@echo off
rem Run full performance suite (Windows CMD) with diagnostics
setlocal enabledelayedexpansion

echo === Full performance run (with diagnostics) ===
echo Ensure Docker and k6 are installed and in PATH

rem Default: clean previous artifacts to avoid mixing results
if "%CLEAN%"=="" set CLEAN=1
if "%CLEAN%"=="1" (
  echo Cleaning previous performance artifacts...
  del /q tests\performance\results_*.json 2>nul
  del /q tests\performance\results_*.txt 2>nul
  del /q tests\performance\debug_output.txt 2>nul
  del /q tests\performance\report.txt 2>nul
  del /q tests\performance\docker_stats.txt 2>nul
  del /q tests\performance\mongo_server_status.txt 2>nul
  del /q tests\performance\rust-api-logs*.txt 2>nul
)

echo Bringing up services (mongodb, redis, rust-api)...

rem disable rate limits for performance run
set RATE_LIMIT_DISABLED=1
set RATE_LIMIT_PER_IP=10000
set HINTS_MAX_PER_SESSION=0
set HINTS_PYTHON_API_ENABLED=0
set SSE_MAX_STREAM_SECONDS=20
set SSE_TICK_INTERVAL_MS=5

rem make anticheat write async during perf to avoid sync DB writes blocking requests
set ANTICHEAT_WRITE_ASYNC=1
set ANTICHEAT_DISABLED=1
:: set ANTICHEAT_DISABLED=1  REM use this to fully disable anticheat during perf

echo Recreating rust-api with updated env...
docker compose up -d --build --force-recreate rust-api >nul 2>&1

docker compose up -d mongodb redis rust-api

echo Waiting for API health (up to 60s)...
set /a i=0
:health_check
curl -s http://localhost:8081/health | findstr /i "healthy" >nul
if %ERRORLEVEL%==0 (
  echo API healthy.
) else (
  if %i% GEQ 30 (
    echo API did not become healthy in time. Aborting.
    endlocal
    exit /b 1
  )
  set /a i+=1
  timeout /t 2 >nul
  goto health_check
)

echo Flushing Redis (clearing rate limits and sessions)...
if "%REDIS_PASSWORD%"=="" set REDIS_PASSWORD=redispass
docker exec -i trainingground-redis redis-cli -a %REDIS_PASSWORD% FLUSHDB >nul

echo Seeding sample task in MongoDB (task_id: task-1)...
if "%MONGO_USER%"=="" set MONGO_USER=admin
if "%MONGO_PASSWORD%"=="" set MONGO_PASSWORD=password
docker exec -i trainingground-mongodb mongosh -u %MONGO_USER% -p %MONGO_PASSWORD% --authenticationDatabase admin --quiet --eval "db.getSiblingDB('trainingground').tasks.replaceOne({_id:'task-1'}, {_id:'task-1',template_id:ObjectId('000000000000000000000001'),session_id:'seed-session',content:{prompt:'Sample Task'},correct_answer:'correct_answer',title:'Sample Task',description:'Sample',static_hint:'Try breaking the problem into smaller steps.',time_limit_seconds:300,createdAt:new Date(),updatedAt:new Date()}, {upsert:true})" >nul

rem Prepare output folders
mkdir tests\performance >nul 2>nul

rem --- Answers test ---
echo Running answers test (default VUs/Stages)...
k6 run --out json=tests/performance/results_answers.json tests/performance/answers.js > tests/performance/results_answers.txt 2>&1
rem extract key lines to report
echo === Answers test summary ===> tests/performance/report.txt
echo Answers test results: > tests/performance/report.txt
findstr /C:"http_req_failed" /C:"http_req_duration" /C:"checks_total" /C:"checks_succeeded" tests/performance/results_answers.txt >> tests/performance/report.txt || echo (no summary lines found) >> tests/performance/report.txt
rem Append a short tail of k6 output
echo. >> tests/performance/report.txt
echo Last k6 output lines: >> tests/performance/report.txt
tail -n 20 tests/performance/results_answers.txt >> tests/performance/report.txt 2>nul || (for /f "skip=1 tokens=*" %%L in ('powershell -Command "Get-Content tests/performance/results_answers.txt -Tail 20"') do @echo %%L >> tests/performance/report.txt)

rem --- Hints test ---
echo Running hints test...
k6 run --out json=tests/performance/results_hints.json tests/performance/hints.js > tests/performance/results_hints.txt 2>&1
findstr /C:"http_req_failed" /C:"http_req_duration" /C:"checks_total" /C:"checks_succeeded" tests/performance/results_hints.txt >> tests/performance/report.txt || echo (no summary lines found) >> tests/performance/report.txt
echo. >> tests/performance/report.txt
echo Last k6 output lines: >> tests/performance/report.txt
tail -n 20 tests/performance/results_hints.txt >> tests/performance/report.txt 2>nul || (for /f "skip=1 tokens=*" %%L in ('powershell -Command "Get-Content tests/performance/results_hints.txt -Tail 20"') do @echo %%L >> tests/performance/report.txt)

rem --- SSE test ---
echo Running sse test...
k6 run --out json=tests/performance/results_sse.json tests/performance/sse.js > tests/performance/results_sse.txt 2>&1
findstr /C:"http_req_failed" /C:"http_req_duration" /C:"checks_total" /C:"checks_succeeded" tests/performance/results_sse.txt >> tests/performance/report.txt || echo (no summary lines found) >> tests/performance/report.txt
echo. >> tests/performance/report.txt
echo Last k6 output lines: >> tests/performance/report.txt
tail -n 20 tests/performance/results_sse.txt >> tests/performance/report.txt 2>nul || (for /f "skip=1 tokens=*" %%L in ('powershell -Command "Get-Content tests/performance/results_sse.txt -Tail 20"') do @echo %%L >> tests/performance/report.txt)

rem Run debug script to capture failed responses
echo Running debug failures script (prints failed responses)... >> tests/performance/report.txt
k6 run tests/performance/debug_failures.js > tests/performance/debug_output.txt 2>&1
findstr /C:"FAILED:" tests/performance/debug_output.txt >> tests/performance/report.txt || echo (no failed responses captured) >> tests/performance/report.txt

rem Collect container stats and service logs
echo. >> tests/performance/report.txt
echo === Container resource snapshot (docker stats --no-stream) === >> tests/performance/report.txt
docker stats --no-stream --format "{{.Name}} {{.CPUPerc}} {{.MemUsage}}" > tests/performance/docker_stats.txt
type tests/performance/docker_stats.txt >> tests/performance/report.txt

echo. >> tests/performance/report.txt
echo === Redis info and rate-limit keys === >> tests/performance/report.txt
docker exec -i trainingground-redis redis-cli -a %REDIS_PASSWORD% INFO | findstr /C:"used_memory" /C:"connected_clients" >> tests/performance/report.txt 2>nul || echo (could not get redis INFO) >> tests/performance/report.txt
docker exec -i trainingground-redis redis-cli -a %REDIS_PASSWORD% KEYS "ratelimit*" >> tests/performance/report.txt 2>nul || echo (could not list ratelimit keys) >> tests/performance/report.txt

rem Show incidents queue length if any (fallback storage for failed incident writes)
docker exec -i trainingground-redis redis-cli -a %REDIS_PASSWORD% LLEN incidents:queue >> tests/performance/report.txt 2>nul || echo (no incidents queue) >> tests/performance/report.txt
if %ERRORLEVEL%==0 (
  docker exec -i trainingground-redis redis-cli -a %REDIS_PASSWORD% LRANGE incidents:queue 0 10 >> tests/performance/report.txt 2>nul || echo (could not fetch incidents queue items) >> tests/performance/report.txt
)

echo. >> tests/performance/report.txt
echo === MongoDB serverStatus summary === >> tests/performance/report.txt
docker exec -i trainingground-mongodb mongosh -u %MONGO_USER% -p %MONGO_PASSWORD% --authenticationDatabase admin --eval "db.serverStatus()" --quiet > tests/performance/mongo_server_status.txt 2>nul || echo (could not get mongo serverStatus) >> tests/performance/report.txt
type tests/performance/mongo_server_status.txt | findstr /C:"ok" /C:"connections" /C:"mem" >> tests/performance/report.txt 2>nul || echo (no mongo summary available) >> tests/performance/report.txt

echo. >> tests/performance/report.txt
echo === Rust API logs (last 200 lines) === >> tests/performance/report.txt
docker compose logs --tail 200 rust-api >> tests/performance/report.txt

echo Report saved to tests/performance/report.txt

echo Full performance run finished.
endlocal
pause
