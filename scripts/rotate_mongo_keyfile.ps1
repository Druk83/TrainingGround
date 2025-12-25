# Rotate MongoDB replica set keyfile with zero downtime
# Usage: .\scripts\rotate_mongo_keyfile.ps1

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "MongoDB Keyfile Rotation (Zero Downtime)" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Generate new keyfile
Write-Host "[STEP 1/5] Generating new keyfile..." -ForegroundColor Green
& "$PSScriptRoot\generate_mongo_keyfile.ps1" -OutputPath "infra\mongo-keyfile.new"
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Failed to generate new keyfile" -ForegroundColor Red
    exit 1
}

# Step 2: Verify Docker services are running
Write-Host ""
Write-Host "[STEP 2/5] Verifying MongoDB services are running..." -ForegroundColor Green

$primaryRunning = docker compose ps mongodb-primary --format json | ConvertFrom-Json | Where-Object { $_.State -eq "running" }
if (-not $primaryRunning) {
    Write-Host "[ERROR] MongoDB primary is not running" -ForegroundColor Red
    Write-Host "Start it with: docker compose up -d mongodb-primary" -ForegroundColor Yellow
    exit 1
}

$secondary1Running = docker compose ps mongodb-secondary1 --format json | ConvertFrom-Json | Where-Object { $_.State -eq "running" }
$secondary2Running = docker compose ps mongodb-secondary2 --format json | ConvertFrom-Json | Where-Object { $_.State -eq "running" }

if (-not $secondary1Running -and -not $secondary2Running) {
    Write-Host "[WARN] No secondary nodes running (optional for rotation)" -ForegroundColor Yellow
}

Write-Host "[OK] Primary node is running" -ForegroundColor Green

# Step 3: Get container names
Write-Host ""
Write-Host "[STEP 3/5] Updating keyfile on replica set members..." -ForegroundColor Green

$primaryContainer = docker compose ps -q mongodb-primary
$secondary1Container = if ($secondary1Running) { docker compose ps -q mongodb-secondary1 } else { $null }
$secondary2Container = if ($secondary2Running) { docker compose ps -q mongodb-secondary2 } else { $null }

# Copy to docker containers
Write-Host "[INFO] Copying new keyfile to primary container..." -ForegroundColor Cyan
docker cp infra\mongo-keyfile.new "${primaryContainer}:/data/keyfile/mongo-keyfile.new"
docker exec $primaryContainer chmod 400 /data/keyfile/mongo-keyfile.new
docker exec $primaryContainer chown mongodb:mongodb /data/keyfile/mongo-keyfile.new

if ($secondary1Container) {
    Write-Host "[INFO] Copying new keyfile to secondary1 container..." -ForegroundColor Cyan
    docker cp infra\mongo-keyfile.new "${secondary1Container}:/data/keyfile/mongo-keyfile.new"
    docker exec $secondary1Container chmod 400 /data/keyfile/mongo-keyfile.new
    docker exec $secondary1Container chown mongodb:mongodb /data/keyfile/mongo-keyfile.new
}

if ($secondary2Container) {
    Write-Host "[INFO] Copying new keyfile to secondary2 container..." -ForegroundColor Cyan
    docker cp infra\mongo-keyfile.new "${secondary2Container}:/data/keyfile/mongo-keyfile.new"
    docker exec $secondary2Container chmod 400 /data/keyfile/mongo-keyfile.new
    docker exec $secondary2Container chown mongodb:mongodb /data/keyfile/mongo-keyfile.new
}

# Step 4: Rolling restart (secondaries first)
Write-Host ""
Write-Host "[STEP 4/5] Performing rolling restart..." -ForegroundColor Green

if ($secondary1Container) {
    Write-Host "[INFO] Restarting secondary1..." -ForegroundColor Cyan
    docker exec $secondary1Container mv /data/keyfile/mongo-keyfile.new /data/keyfile/mongo-keyfile
    docker compose restart mongodb-secondary1

    Write-Host "[INFO] Waiting for secondary1 to rejoin (10 seconds)..." -ForegroundColor Yellow
    Start-Sleep -Seconds 10
}

if ($secondary2Container) {
    Write-Host "[INFO] Restarting secondary2..." -ForegroundColor Cyan
    docker exec $secondary2Container mv /data/keyfile/mongo-keyfile.new /data/keyfile/mongo-keyfile
    docker compose restart mongodb-secondary2

    Write-Host "[INFO] Waiting for secondary2 to rejoin (10 seconds)..." -ForegroundColor Yellow
    Start-Sleep -Seconds 10
}

# Check replica set health before restarting primary
if ($secondary1Container -or $secondary2Container) {
    Write-Host "[INFO] Checking replica set status..." -ForegroundColor Cyan
    $rsStatus = docker exec $primaryContainer mongosh --quiet --eval "rs.status().ok"
    if ($rsStatus -ne "1") {
        Write-Host "[ERROR] Replica set unhealthy after secondary restart" -ForegroundColor Red
        Write-Host "Manual recovery required. Old keyfile backed up." -ForegroundColor Yellow
        exit 1
    }
    Write-Host "[OK] Secondaries rejoined successfully" -ForegroundColor Green
}

# Restart primary
Write-Host "[INFO] Restarting primary..." -ForegroundColor Cyan
docker exec $primaryContainer mv /data/keyfile/mongo-keyfile.new /data/keyfile/mongo-keyfile
docker compose restart mongodb-primary

Write-Host "[INFO] Waiting for primary election (10 seconds)..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Verify replica set health
Write-Host "[INFO] Verifying replica set health..." -ForegroundColor Cyan
$rsStatusFinal = docker exec $primaryContainer mongosh --quiet --eval "rs.status().ok"
if ($rsStatusFinal -ne "1") {
    Write-Host "[ERROR] Replica set unhealthy after primary restart" -ForegroundColor Red
    Write-Host "Manual recovery required. Old keyfile backed up." -ForegroundColor Yellow
    exit 1
}

# Step 5: Update local keyfile
Write-Host ""
Write-Host "[STEP 5/5] Updating local keyfile..." -ForegroundColor Green
Move-Item infra\mongo-keyfile.new infra\mongo-keyfile -Force

Write-Host ""
Write-Host "================================================================" -ForegroundColor Green
Write-Host "[OK] MongoDB keyfile rotation completed successfully" -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "VERIFICATION:" -ForegroundColor Cyan
Write-Host "  1. Check replica set: docker exec $primaryContainer mongosh --eval 'rs.status()'"
Write-Host "  2. Check authentication: docker compose logs rust-api | Select-String 'MongoDB connection'"
Write-Host "  3. Test admin login at http://localhost:4173/admin"
Write-Host ""
