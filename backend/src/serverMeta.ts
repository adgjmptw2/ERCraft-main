import { statSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

export const SERVER_STARTED_AT = new Date().toISOString()

export function resolveServerBuildTimestamp(): string | null {
  try {
    const here = dirname(fileURLToPath(import.meta.url))
    const distServer = join(here, "server.js")
    return statSync(distServer).mtime.toISOString()
  } catch {
    return null
  }
}