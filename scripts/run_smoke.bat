@echo off
rem Run smoke test for TrainingGround (Windows CMD)
setlocal enabledelayedexpansion





























pauseendlocal
 echo Smoke run finished. Results saved to tests/performance/results_smoke.jsondocker compose logs --tail 200 rust-api > tests/performance/rust-api-logs.txt
 echo Collecting rust-api logs -> tests/performance/rust-api-logs.txtk6 run --out json=tests/performance/results_smoke.json --vus 5 --duration 30s tests/performance/answers.js
 echo Running k6 smoke test (5 VUs, 30s) -> tests/performance/results_smoke.jsondocker exec -i trainingground-mongodb mongosh -u %MONGO_USER% -p %MONGO_PASSWORD% --authenticationDatabase admin --eval "use trainingground; db.tasks.updateOne({_id:'task-1'}, {$set:{title:'Sample Task',description:'Sample',correct_answer:'correct_answer',time_limit_seconds:300}}, {upsert:true})"
 echo Seeding sample task in MongoDB (task_id: task-1)...docker exec -i trainingground-redis redis-cli -a %REDIS_PASSWORD% FLUSHDB
 echo Flushing Redis (clearing rate limits and sessions)...)  goto health_check  timeout /t 2 >nul  set /a i+=1  )    exit /b 1    echo API did not become healthy in time. Aborting.  if %i% GEQ 30 () else (  echo API healthy.if %ERRORLEVEL%==0 (curl -s http://localhost:8081/health | findstr /i "healthy" >nulset /a i=0
:health_check
 echo Waiting for API health (up to 60s)...docker compose up -d mongodb redis rust-api
 echo Bringing up services (mongodb, redis, rust-api)... echo === Starting smoke-run ===
