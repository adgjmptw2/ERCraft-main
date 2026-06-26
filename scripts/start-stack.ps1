# ERCraft stack: backend + frontend + discord bot + collector (no Cursor)
$Node = "C:\Program Files\nodejs\node.exe"
$Npm = "C:\Program Files\nodejs\npm.cmd"
$Ercraft = "C:\Users\MINE\Desktop\Study\ERCraft-main"
$Discord = "C:\Users\MINE\Desktop\Study\MINE-Discord-main"
$Logs = Join-Path $Ercraft "logs"
New-Item -ItemType Directory -Force -Path $Logs | Out-Null

function Start-Detached([string]$Name, [string]$Wd, [string]$Exe, [string]$Args, [string]$Log) {
  $out = Join-Path $Logs "$Log.out.log"
  $err = Join-Path $Logs "$Log.err.log"
  $p = Start-Process -FilePath $Exe -ArgumentList $Args -WorkingDirectory $Wd -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $err -PassThru
  Write-Host "started $Name pid=$($p.Id) log=$out"
}

# 1 backend (production, lighter than tsx watch)
Start-Detached "backend" (Join-Path $Ercraft "backend") $Node "dist\server.js" "backend"

# 2 frontend
Start-Detached "frontend" $Ercraft $Npm "run dev -- --host 127.0.0.1" "frontend"

# 3 discord bot (bot only; use start:all in Discord folder if Lavalink also needed)
Start-Detached "discord-bot" $Discord $Node "dist\index.js" "discord-bot"

# 4 collector autorun (single instance)
$collectorPid = Join-Path $Ercraft "backend\logs\collector-autorun.pid"
if (Test-Path $collectorPid) {
  $old = Get-Content $collectorPid -ErrorAction SilentlyContinue
  if ($old -and (Get-Process -Id $old -ErrorAction SilentlyContinue)) {
    Write-Host "collector autorun already running pid=$old"
  } else {
    Start-Process powershell -ArgumentList "-NoProfile","-ExecutionPolicy","Bypass","-File",(Join-Path $Ercraft "backend\scripts\collector-autorun.ps1") -WorkingDirectory (Join-Path $Ercraft "backend") -WindowStyle Minimized
    Write-Host "started collector autorun"
  }
} else {
  Start-Process powershell -ArgumentList "-NoProfile","-ExecutionPolicy","Bypass","-File",(Join-Path $Ercraft "backend\scripts\collector-autorun.ps1") -WorkingDirectory (Join-Path $Ercraft "backend") -WindowStyle Minimized
  Write-Host "started collector autorun"
}

Write-Host "done. Close Cursor safely. Logs: $Logs"