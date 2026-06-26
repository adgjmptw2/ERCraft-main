# ERCraft collector autorun. Log: backend/logs/collector-autorun.log
param(
  [int]$ChunkApi = 250,
  [int]$MaxApiPerCommand = 1000,
  [int]$TargetPending = 7000,
  [int]$BalancedApi = 500,
  [int]$MinBudgetToRun = 250,
  [int]$MinBudgetForBalanced = 1500,
  [int]$SleepWhenExhaustedSeconds = 300
)
$ErrorActionPreference = "Continue"
$BackendRoot = Split-Path $PSScriptRoot -Parent
Set-Location $BackendRoot
$NodeExe = "C:\Program Files\nodejs\node.exe"
if (-not (Test-Path $NodeExe)) { $NodeExe = (Get-Command node -ErrorAction SilentlyContinue).Source }
if (-not $NodeExe) { throw "node.exe not found" }
$LogDir = Join-Path $BackendRoot "logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$LogFile = Join-Path $LogDir "collector-autorun.log"
$PidFile = Join-Path $LogDir "collector-autorun.pid"
function Write-Log([string]$Message) {
  $line = "$(Get-Date -Format o) $Message"
  Add-Content -Path $LogFile -Value $line -Encoding UTF8
}
Set-Content -Path $PidFile -Value $PID -Encoding ASCII
Write-Log "autorun started pid=$PID node=$NodeExe"
while ($true) {
  try {
    $status = & $NodeExe dist/collector/cli.js status 2>&1 | ConvertFrom-Json
    Write-Log "pending=$($status.pendingIdentities) used=$($status.usedToday) remaining=$($status.remainingToday)"
    if ($status.remainingToday -lt $MinBudgetToRun) {
      Write-Log "budget low, sleep $SleepWhenExhaustedSeconds"
      Start-Sleep -Seconds $SleepWhenExhaustedSeconds
      continue
    }
    if ($status.pendingIdentities -gt $TargetPending) {
      Write-Log "drain-until max=$MaxApiPerCommand"
      $out = & $NodeExe dist/collector/cli.js drain-until --target-pending=$TargetPending --chunk-requests=$ChunkApi --max-total-requests=$MaxApiPerCommand 2>&1 |
        ForEach-Object { if ($_ -is [System.Management.Automation.ErrorRecord]) { $_.ToString() } else { "$_" } } |
        Out-String
    } elseif ($status.remainingToday -ge $MinBudgetForBalanced) {
      Write-Log "auto balanced $BalancedApi"
      $out = & $NodeExe dist/collector/cli.js once --mode=auto --max-requests=$BalancedApi --seed-limit=200 2>&1 |
        ForEach-Object { if ($_ -is [System.Management.Automation.ErrorRecord]) { $_.ToString() } else { "$_" } } |
        Out-String
    } else {
      Write-Log "waiting for balanced budget"
      Start-Sleep -Seconds $SleepWhenExhaustedSeconds
      continue
    }
    Add-Content -Path $LogFile -Value $out -Encoding UTF8
    if ($out -match 'fatal-auth-error') {
      Write-Log 'fatal-auth-error (BSER 401/403?) — sleep 10m then retry'
      Start-Sleep -Seconds 600
      continue
    }
  } catch {
    Write-Log "error: $($_.Exception.Message)"
    Start-Sleep -Seconds 60
  }
}