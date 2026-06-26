import { spawn } from "node:child_process"
import { existsSync, mkdirSync, appendFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const BACKEND = path.join(ROOT, "backend")
const DISCORD_ROOT = path.resolve(ROOT, "..", "MINE-Discord-main")
const LOG_DIR = path.join(ROOT, "logs")
const NODE = process.execPath

mkdirSync(LOG_DIR, { recursive: true })

function logPath(name, stream) {
  return path.join(LOG_DIR, `${name}.${stream}.log`)
}

function spawnDetached(name, cwd, command, args) {
  const out = logPath(name, "out")
  const err = logPath(name, "err")
  appendFileSync(out, `\n--- ${name} start ${new Date().toISOString()} ---\n`)
  const child = spawn(command, args, {
    cwd,
    detached: true,
    stdio: ["ignore", "ignore", "ignore"],
    windowsHide: true,
    env: process.env,
    shell: false,
  })
  child.unref()
  console.log(`[start-all] ${name} pid=${child.pid}`)
  console.log(`[start-all] ${name} logs ${out} ${err}`)
}

function assertBackendBuild() {
  if (!existsSync(path.join(BACKEND, "dist", "server.js"))) {
    console.error("[start-all] run: cd backend && npm run build")
    process.exit(1)
  }
}

function assertDiscordBuild() {
  if (!existsSync(path.join(DISCORD_ROOT, "dist", "index.js"))) {
    console.error("[start-all] run: cd MINE-Discord-main && npm run build")
    process.exit(1)
  }
}

assertBackendBuild()
assertDiscordBuild()

const collectorScript = path.join(BACKEND, "scripts", "collector-autorun.ps1")
if (!existsSync(collectorScript)) {
  console.error("[start-all] missing collector-autorun.ps1")
  process.exit(1)
}

console.log("[start-all] launching stack (detached). Cursor can be closed.")

spawnDetached("backend", BACKEND, NODE, ["dist/server.js"])
spawnDetached("frontend", ROOT, "cmd.exe", ["/c", "npm run dev -- --host 127.0.0.1"])
spawnDetached("collector", BACKEND, "powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", collectorScript])
spawnDetached("discord", DISCORD_ROOT, NODE, ["scripts/start-all.js"])

console.log("[start-all] backend  http://127.0.0.1:3001")
console.log("[start-all] frontend http://127.0.0.1:5173")
console.log("[start-all] stop     npm run stop:all")