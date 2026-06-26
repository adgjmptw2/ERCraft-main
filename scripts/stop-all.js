import { spawnSync } from "node:child_process"

const PATTERNS = [
  /ERCraft-main[\\/]backend[\\/]dist[\\/]server/i,
  /ERCraft-main[\\/]backend[\\/]dist[\\/]collector[\\/]cli/i,
  /ERCraft-main[\\/].*vite/i,
  /ERCraft-main[\\/]backend[\\/].*tsx/i,
  /vitest/i,
  /tinypool/i,
  /npm-cli\.js.*test/i,
  /collector-autorun/i,
  /MINE-Discord-main/i,
]

function listProcesses() {
  const ps = spawnSync(
    "powershell",
    ["-NoProfile", "-Command", "Get-CimInstance Win32_Process -Filter \"Name=''node.exe'' OR Name=''powershell.exe''\" | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress"],
    { encoding: "utf8" },
  )
  if (ps.status !== 0 || !ps.stdout.trim()) return []
  const parsed = JSON.parse(ps.stdout)
  return Array.isArray(parsed) ? parsed : [parsed]
}

function killPid(pid) {
  spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" })
}

let killed = 0
for (const proc of listProcesses()) {
  const cmd = proc.CommandLine ?? ""
  const pid = proc.ProcessId
  if (!pid || !cmd) continue
  if (PATTERNS.some((re) => re.test(cmd))) {
    console.log(`[stop-all] kill pid=${pid}`)
    killPid(pid)
    killed += 1
  }
}
console.log(`[stop-all] stopped ${killed} process trees`)