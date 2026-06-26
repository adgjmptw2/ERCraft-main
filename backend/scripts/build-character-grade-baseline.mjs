import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const execFileAsync = promisify(execFile)

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../..')
const outDir = path.resolve(__dirname, '../src/data/characterGrade')

const STATS_FILE = 'er_stats_all_tiers.json'
const ROLES_FILE = 'ercraft_character_weapon_roles_v1.json'

const ZIP_CANDIDATES = [
  path.join(repoRoot, 'dakgg_er_stats (2).zip'),
  path.join(repoRoot, 'dakgg_er_stats.zip'),
]

const EXTRACTED_DIR_CANDIDATES = [
  path.join(repoRoot, 'dakgg_er_stats'),
  path.join(repoRoot, 'backend', 'data', 'dakgg-source'),
]

const BASELINE_FIELDS = [
  'count',
  'winRate',
  'top3Rate',
  'averagePlace',
  'averagePlayerKill',
  'averagePlayerAssistant',
  'averageTeamKill',
  'averageDeaths',
  'averageDamageToPlayer',
  'averageViewContribution',
  'averageMonsterKill',
]

function comboKey(tierKey, characterId, weaponId) {
  return `${tierKey}:${characterId}:${weaponId}`
}

function pickBaselineFields(row) {
  const picked = {}
  for (const field of BASELINE_FIELDS) {
    if (typeof row[field] === 'number' && Number.isFinite(row[field])) {
      picked[field] = row[field]
    }
  }
  return picked
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath)
    return true
  } catch {
    return false
  }
}

async function hasSourceFiles(dir) {
  return (
    (await pathExists(path.join(dir, STATS_FILE))) &&
    (await pathExists(path.join(dir, ROLES_FILE)))
  )
}

async function extractZipToTemp(zipPath) {
  const tempDir = await fs.mkdtemp(path.join(tmpdir(), 'ercraft-dakgg-'))
  if (process.platform === 'win32') {
    const psZip = zipPath.replace(/'/g, "''")
    const psDest = tempDir.replace(/'/g, "''")
    await execFileAsync('powershell', [
      '-NoProfile',
      '-Command',
      `Expand-Archive -LiteralPath '${psZip}' -DestinationPath '${psDest}' -Force`,
    ])
  } else {
    await execFileAsync('unzip', ['-q', zipPath, '-d', tempDir])
  }
  return tempDir
}

async function resolveSourceDir() {
  if (process.env.CHARACTER_GRADE_SOURCE_DIR) {
    const envDir = path.resolve(process.env.CHARACTER_GRADE_SOURCE_DIR)
    if (!(await hasSourceFiles(envDir))) {
      throw new Error(`CHARACTER_GRADE_SOURCE_DIR missing required files: ${envDir}`)
    }
    return { dir: envDir, cleanup: async () => {} }
  }

  for (const dir of EXTRACTED_DIR_CANDIDATES) {
    if (await hasSourceFiles(dir)) {
      return { dir, cleanup: async () => {} }
    }
  }

  for (const zipPath of ZIP_CANDIDATES) {
    if (!(await pathExists(zipPath))) continue
    const tempDir = await extractZipToTemp(zipPath)
    if (!(await hasSourceFiles(tempDir))) {
      await fs.rm(tempDir, { recursive: true, force: true })
      throw new Error(`Zip extracted but required files missing: ${zipPath}`)
    }
    return {
      dir: tempDir,
      cleanup: async () => {
        await fs.rm(tempDir, { recursive: true, force: true })
      },
    }
  }

  throw new Error(
    'Character grade source not found. Place dakgg_er_stats (2).zip in repo root or set CHARACTER_GRADE_SOURCE_DIR.',
  )
}

async function main() {
  const { dir: sourceDir, cleanup } = await resolveSourceDir()
  try {
    const statsPath = path.join(sourceDir, STATS_FILE)
    const rolesPath = path.join(sourceDir, ROLES_FILE)
    const statsRaw = JSON.parse(await fs.readFile(statsPath, 'utf8'))
    const rolesRaw = JSON.parse(await fs.readFile(rolesPath, 'utf8'))

    const combinations = {}
    for (const tier of statsRaw.tiers ?? []) {
      const tierKey = tier.tierKey
      for (const weapon of tier.weapons ?? []) {
        const key = comboKey(tierKey, weapon.characterId, weapon.weaponId)
        combinations[key] = pickBaselineFields(weapon)
      }
    }

    const roleEntries = {}
    for (const entry of rolesRaw.entries ?? []) {
      roleEntries[`${entry.characterNum}:${entry.weaponTypeId}`] = {
        characterNum: entry.characterNum,
        weaponTypeId: entry.weaponTypeId,
        role: entry.role,
      }
    }

    await fs.mkdir(outDir, { recursive: true })

    const baselineDoc = {
      schemaVersion: 1,
      sourceArchive: 'dakgg_er_stats (2).zip',
      collectedAt: statsRaw.collectedAt ?? null,
      periodDays: statsRaw.request?.dt ?? 7,
      matchingMode: statsRaw.request?.matchingMode ?? 'RANK',
      teamMode: statsRaw.request?.teamMode ?? 'SQUAD',
      combinationCount: Object.keys(combinations).length,
      combinations,
    }

    const rolesDoc = {
      schemaVersion: 1,
      combinationCount: Object.keys(roleEntries).length,
      entries: roleEntries,
    }

    await fs.writeFile(
      path.join(outDir, 'tier-baselines.v1.json'),
      JSON.stringify(baselineDoc),
    )
    await fs.writeFile(
      path.join(outDir, 'character-weapon-roles.v1.json'),
      JSON.stringify(rolesDoc),
    )

    console.log(
      `Source: ${sourceDir}\nWrote ${baselineDoc.combinationCount} baselines and ${rolesDoc.combinationCount} role entries to ${outDir}`,
    )
  } finally {
    await cleanup()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
