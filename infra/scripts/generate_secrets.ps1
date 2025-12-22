# Generate secure random passwords for TrainingGround services
# Usage: powershell -ExecutionPolicy Bypass -File infra/scripts/generate_secrets.ps1

$ErrorActionPreference = "Stop"

$ROOT_DIR = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$ENV_FILE = Join-Path $ROOT_DIR ".env"
$ENV_EXAMPLE = Join-Path $ROOT_DIR ".env.example"

Write-Host "TrainingGround Secrets Generator" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""

# Function to generate secure random password
function Generate-Password {
    param([int]$Length = 32)
    $bytes = New-Object byte[] $Length
    ([Security.Cryptography.RNGCryptoServiceProvider]::Create()).GetBytes($bytes)
    return [Convert]::ToBase64String($bytes).Substring(0, $Length) -replace '[+/=]', ''
}

# Function to generate JWT secret
function Generate-JWTSecret {
    $bytes = New-Object byte[] 64
    ([Security.Cryptography.RNGCryptoServiceProvider]::Create()).GetBytes($bytes)
    return -join ($bytes | ForEach-Object { $_.ToString("x2") })
}

# Check if .env exists
if (-not (Test-Path $ENV_FILE)) {
    Write-Host ".env not found, copying from .env.example..." -ForegroundColor Yellow
    Copy-Item $ENV_EXAMPLE $ENV_FILE
}

Write-Host "Generating secure passwords..." -ForegroundColor Green
Write-Host ""

# Backup existing .env
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$BACKUP_FILE = "$ENV_FILE.backup.$timestamp"
Copy-Item $ENV_FILE $BACKUP_FILE
Write-Host "Backup created: $BACKUP_FILE" -ForegroundColor Green
Write-Host ""

# Generate passwords
$MONGO_USER = "admin"
$MONGO_PASSWORD = Generate-Password -Length 24
$REDIS_PASSWORD = Generate-Password -Length 32
$QDRANT_API_KEY = Generate-Password -Length 32
$JWT_SECRET = Generate-JWTSecret
$GRAFANA_PASSWORD = Generate-Password -Length 20

# Update .env file
function Update-EnvVar {
    param([string]$Key, [string]$Value)

    $content = Get-Content $ENV_FILE
    $updated = $false

    $newContent = $content | ForEach-Object {
        if ($_ -match "^$Key=") {
            "$Key=$Value"
            $updated = $true
        } else {
            $_
        }
    }

    if (-not $updated) {
        $newContent += "$Key=$Value"
    }

    $newContent | Set-Content $ENV_FILE
}

Write-Host "Updating .env file with generated secrets..." -ForegroundColor Green

Update-EnvVar "MONGO_USER" $MONGO_USER
Update-EnvVar "MONGO_PASSWORD" $MONGO_PASSWORD
Update-EnvVar "REDIS_PASSWORD" $REDIS_PASSWORD
Update-EnvVar "QDRANT_API_KEY" $QDRANT_API_KEY
Update-EnvVar "JWT_SECRET" $JWT_SECRET
Update-EnvVar "GRAFANA_PASSWORD" $GRAFANA_PASSWORD

# Also update MONGODB_URI if it exists
$MONGODB_URI = "mongodb://`${MONGO_USER}:`${MONGO_PASSWORD}@localhost:27017/trainingground"
Update-EnvVar "MONGODB_URI" $MONGODB_URI

Write-Host ""
Write-Host "Secrets generated successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "Generated Credentials (SAVE THESE SECURELY!)" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "MongoDB:" -ForegroundColor Yellow
Write-Host "  User:     $MONGO_USER"
Write-Host "  Password: $MONGO_PASSWORD"
Write-Host ""
Write-Host "Redis:" -ForegroundColor Yellow
Write-Host "  Password: $REDIS_PASSWORD"
Write-Host ""
Write-Host "Qdrant:" -ForegroundColor Yellow
Write-Host "  API Key:  $QDRANT_API_KEY"
Write-Host ""
Write-Host "JWT:" -ForegroundColor Yellow
Write-Host "  Secret:   $JWT_SECRET"
Write-Host ""
Write-Host "Grafana:" -ForegroundColor Yellow
Write-Host "  Admin:    admin"
Write-Host "  Password: $GRAFANA_PASSWORD"
Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "IMPORTANT:" -ForegroundColor Red
Write-Host "1. Credentials saved to: $ENV_FILE"
Write-Host "2. Backup created at: $BACKUP_FILE"
Write-Host "3. Do NOT commit .env to git!"
Write-Host "4. For production, store secrets in Yandex Lockbox or HashiCorp Vault"
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Green
Write-Host "1. Review the .env file"
Write-Host "2. Run: docker-compose down -v"
Write-Host "3. Run: docker-compose up -d"
Write-Host "4. Save credentials to password manager"
Write-Host ""
