# PowerShell pre-commit orchestrator для Windows
# Определяет измененные компоненты и запускает соответствующие проверки

Write-Host "================================" -ForegroundColor Cyan
Write-Host "Pre-commit validation started" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Получить список измененных файлов
$changedFiles = git diff --cached --name-only

if (-not $changedFiles) {
    Write-Host "[INFO] No files staged for commit" -ForegroundColor Yellow
    exit 0
}

$runFrontend = $false
$runRust = $false
$runPython = $false

# Определить затронутые компоненты
foreach ($file in $changedFiles) {
    if ($file -like "frontend/*") {
        $runFrontend = $true
    }
    if ($file -like "backend/rust-api/*") {
        $runRust = $true
    }
    if ($file -like "backend/python-generator/*") {
        $runPython = $true
    }
}

$hasErrors = $false

# Frontend проверки
if ($runFrontend) {
    Write-Host "[INFO] Running Frontend checks..." -ForegroundColor Yellow
    
    if (Test-Path "frontend") {
        Push-Location frontend
        
        try {
            Write-Host "  - Linting..." -ForegroundColor Gray
            npm run lint
            if ($LASTEXITCODE -ne 0) { $hasErrors = $true }
            
            Write-Host "  - Format check..." -ForegroundColor Gray
            npm run format:check
            if ($LASTEXITCODE -ne 0) { $hasErrors = $true }
            
            Write-Host "  - Type checking..." -ForegroundColor Gray
            npm run type-check
            if ($LASTEXITCODE -ne 0) { $hasErrors = $true }
            
            Write-Host "  - Security audit..." -ForegroundColor Gray
            npm audit --audit-level=moderate
            if ($LASTEXITCODE -ne 0) { $hasErrors = $true }
            
            if (-not $hasErrors) {
                Write-Host "[SUCCESS] Frontend checks passed!" -ForegroundColor Green
            }
        }
        finally {
            Pop-Location
        }
    }
    Write-Host ""
}

# Rust проверки
if ($runRust) {
    Write-Host "[INFO] Running Rust checks..." -ForegroundColor Yellow
    
    if (Test-Path "backend\rust-api") {
        Push-Location backend\rust-api
        
        try {
            Write-Host "  - Format check..." -ForegroundColor Gray
            cargo fmt --check
            if ($LASTEXITCODE -ne 0) { $hasErrors = $true }
            
            Write-Host "  - Clippy..." -ForegroundColor Gray
            cargo clippy --all-targets --all-features -- -D warnings
            if ($LASTEXITCODE -ne 0) { $hasErrors = $true }
            
            Write-Host "  - Unit tests..." -ForegroundColor Gray
            cargo test --lib
            if ($LASTEXITCODE -ne 0) { $hasErrors = $true }
            
            Write-Host "  - Security audit..." -ForegroundColor Gray
            cargo audit
            if ($LASTEXITCODE -ne 0) { $hasErrors = $true }
            
            if (-not $hasErrors) {
                Write-Host "[SUCCESS] Rust checks passed!" -ForegroundColor Green
            }
        }
        finally {
            Pop-Location
        }
    }
    Write-Host ""
}

# Python проверки
if ($runPython) {
    Write-Host "[INFO] Running Python checks..." -ForegroundColor Yellow
    
    if (Test-Path "backend\python-generator") {
        Push-Location backend\python-generator

        $poetryCmd = Get-Command poetry -ErrorAction SilentlyContinue

        function Invoke-PythonCheck {
            param(
                [string]$Command,
                [string[]]$Args
            )

            if ($poetryCmd) {
                poetry run $Command @Args
            }
            else {
                & $Command @Args
            }

            if ($LASTEXITCODE -ne 0) { $script:hasErrors = $true }
        }
        
        try {
            Write-Host "  - Format check..." -ForegroundColor Gray
            Invoke-PythonCheck -Command "black" -Args @("--check", "src/", "tests/")
            
            Write-Host "  - Linting..." -ForegroundColor Gray
            Invoke-PythonCheck -Command "ruff" -Args @("check", "src/", "tests/")
            
            Write-Host "  - Type checking..." -ForegroundColor Gray
            Invoke-PythonCheck -Command "mypy" -Args @("src/")
            
            Write-Host "  - Unit tests..." -ForegroundColor Gray
            Invoke-PythonCheck -Command "pytest" -Args @("tests/unit/", "--tb=short")
            
            Write-Host "  - Security audit..." -ForegroundColor Gray
            Invoke-PythonCheck -Command "pip-audit" -Args @()
            
            if (-not $hasErrors) {
                Write-Host "[SUCCESS] Python checks passed!" -ForegroundColor Green
            }
        }
        finally {
            Pop-Location
        }
    }
    Write-Host ""
}

# Если изменений только в документации
if (-not $runFrontend -and -not $runRust -and -not $runPython) {
    Write-Host "[INFO] No code changes detected, skipping checks" -ForegroundColor Yellow
}

# Итоговый результат
Write-Host "================================" -ForegroundColor Cyan
if ($hasErrors) {
    Write-Host "[ERROR] Pre-commit checks failed!" -ForegroundColor Red
    Write-Host "Please fix the errors and try again." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Quick fixes:" -ForegroundColor White
    Write-Host "  make format  # Auto-format code" -ForegroundColor Gray
    Write-Host "  make lint    # Check linting errors" -ForegroundColor Gray
    Write-Host "================================" -ForegroundColor Cyan
    exit 1
} else {
    Write-Host "All pre-commit checks passed!" -ForegroundColor Green
    Write-Host "================================" -ForegroundColor Cyan
    exit 0
}
