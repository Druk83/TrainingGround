# Generate cryptographically secure MongoDB replica set keyfile
# Usage: .\scripts\generate_mongo_keyfile.ps1 [-OutputPath "infra/mongo-keyfile"]

param(
    [string]$OutputPath = "infra\mongo-keyfile"
)

$ErrorActionPreference = "Stop"

Write-Host "[INFO] MongoDB Keyfile Generator" -ForegroundColor Cyan
Write-Host ""

# Resolve full path
$OutputPath = $OutputPath -replace '/', '\'
if (-not [System.IO.Path]::IsPathRooted($OutputPath)) {
    $OutputPath = Join-Path $PSScriptRoot "..\$OutputPath"
}
$OutputPath = [System.IO.Path]::GetFullPath($OutputPath)

# Backup existing keyfile if present
if (Test-Path $OutputPath) {
    $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $backupPath = "$OutputPath.backup.$timestamp"
    Write-Host "[INFO] Backing up existing keyfile to $backupPath" -ForegroundColor Yellow
    Copy-Item $OutputPath $backupPath
}

# Generate new keyfile (756 bytes base64 = 1008 chars)
Write-Host "[INFO] Generating new MongoDB keyfile (756 bytes)..." -ForegroundColor Green

# Use .NET RNGCryptoServiceProvider for cryptographically secure random data
$rng = New-Object System.Security.Cryptography.RNGCryptoServiceProvider
$bytes = New-Object byte[] 756
$rng.GetBytes($bytes)
$base64 = [Convert]::ToBase64String($bytes)

# Write to file
$base64 | Out-File -FilePath $OutputPath -Encoding ASCII -NoNewline

Write-Host "[OK] MongoDB keyfile generated at: $OutputPath" -ForegroundColor Green
Write-Host ""
Write-Host "SECURITY WARNINGS:" -ForegroundColor Red
Write-Host "  1. NEVER commit this file to git" -ForegroundColor Yellow
Write-Host "  2. Copy this file to ALL replica set members" -ForegroundColor Yellow
Write-Host "  3. Restart MongoDB after updating keyfile" -ForegroundColor Yellow
Write-Host "  4. Keep backup in secure location" -ForegroundColor Yellow
Write-Host ""
Write-Host "NEXT STEPS:" -ForegroundColor Cyan
Write-Host "  1. Verify file exists: Test-Path $OutputPath"
Write-Host "  2. Check size: (Get-Item $OutputPath).Length (should be ~1008 bytes)"
Write-Host "  3. Update docker-compose.yml if needed"
Write-Host "  4. Restart MongoDB: docker compose restart mongodb-primary mongodb-secondary1 mongodb-secondary2"
Write-Host ""

# Display file info
$fileInfo = Get-Item $OutputPath
Write-Host "File created successfully:" -ForegroundColor Green
Write-Host "  Path: $($fileInfo.FullName)"
Write-Host "  Size: $($fileInfo.Length) bytes"
Write-Host "  Modified: $($fileInfo.LastWriteTime)"
