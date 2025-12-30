param(
    [string]$OutputDir = 'tests/performance/exports',
    [string]$MetricsPort = '8090'
)

Write-Host "Collecting export metrics from Prometheus endpoint..."
$exportPath = Join-Path $OutputDir 'export_metrics.json'
$r = Invoke-WebRequest -Uri "http://localhost:$MetricsPort/metrics" -UseBasicParsing
if (-not $?) {
    Write-Error "Failed to fetch metrics"; exit 1
}
$lines = $r.Content -split "`n"
$samples = @()
foreach ($line in $lines) {
    if ($line -match '^export_duration_seconds_bucket') {
        continue
    }
}
