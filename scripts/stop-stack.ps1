# Stop ERCraft stack + common dev junk (vitest/tinypool from Cursor)
$patterns = @(
  "ERCraft-main\\backend\\dist\\server",
  "ERCraft-main\\backend\\dist\\collector\\cli",
  "ERCraft-main\\node_modules\\.*vite",
  "ERCraft-main\\backend\\node_modules\\.*tsx",
  "ERCraft-main\\node_modules\\.*vitest",
  "tinypool",
  "MINE-Discord-main\\dist\\index",
  "MINE-Discord-main\\scripts\\start-all",
  "collector-autorun"
)
Get-CimInstance Win32_Process -Filter "Name=''node.exe'' OR Name=''powershell.exe''" -ErrorAction SilentlyContinue | ForEach-Object {
  $cmd = $_.CommandLine
  if (-not $cmd) { return }
  foreach ($p in $patterns) {
    if ($cmd -match $p) {
      Write-Host "stop pid=$($_.ProcessId) $p"
      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
      break
    }
  }
}
Write-Host "stopped. Run start-stack.ps1 to start clean."