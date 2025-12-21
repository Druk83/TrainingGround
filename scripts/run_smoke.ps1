# PowerShell smoke runner for TrainingGround
Write-Host "=== Starting smoke-run ==="
Write-Host "Bringing up services (mongodb, redis, rust-api)"
docker compose up -d mongodb redis rust-api | Out-Null














Write-Host "Smoke run finished. Results saved to tests/performance/results_smoke.json"docker compose logs --tail 200 rust-api > tests/performance/rust-api-logs.txt
nWrite-Host "Collecting logs"
nWrite-Host "Running k6 smoke test (5 VUs, 30s)"
k6 run --out json=tests/performance/results_smoke.json --vus 5 --duration 30s tests/performance/answers.js
nWrite-Host "Seeding sample task in MongoDB..."
docker exec -i trainingground-mongodb mongosh -u $env:MONGO_USER -p $env:MONGO_PASSWORD --authenticationDatabase admin --eval "use trainingground; db.tasks.updateOne({_id:'task-1'}, {$set:{title:'Sample Task',description:'Sample',correct_answer:'correct_answer',time_limit_seconds:300}}, {upsert:true})" | Out-Null
nWrite-Host "Flushing Redis..."
docker exec -i trainingground-redis redis-cli -a $env:REDIS_PASSWORD FLUSHDB | Out-Nullif ($attempt -ge 30) { Write-Error "API did not become healthy"; exit 1 }}  $attempt++  Start-Sleep -Seconds 2  if ($health -match 'healthy') { Write-Host "API healthy"; break }  $health = (curl -s http://localhost:8081/health) -join ""n# Wait for service healthy
n$attempt=0
nwhile ($attempt -lt 30) {
