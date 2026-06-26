import { formatComboDisplayName } from '../utils/comboDisplayName.js'
import {
  classifyFieldCategories,
  collectPathValues,
  describeValueType,
  inferHealDamageSemantics,
  isLikelyUsableCandidate,
  isNumericValue,
  loadRoleMapFromJson,
  pathMatchesKeyword,
  pickRepresentativeValue,
  SUPPORT_TARGETS,
  TANK_TARGETS,
  type FieldStat,
} from './roleMetricInspect.js'

export { TANK_TARGETS, SUPPORT_TARGETS }

export type CaptureRoleGroup = 'tanker' | 'supporter' | 'dealer' | 'bruiser' | 'other'

export interface CaptureTarget {
  characterNum: number
  weaponTypeId: number
  label: string
  roleGroup: CaptureRoleGroup
}

export const COMPARISON_TARGET_SPECS = [
  { characterNum: 8, weaponTypeId: 22, roleGroup: 'dealer' as const },
  { characterNum: 2, weaponTypeId: 10, roleGroup: 'dealer' as const },
  { characterNum: 60, weaponTypeId: 6, roleGroup: 'dealer' as const },
  { characterNum: 26, weaponTypeId: 9, roleGroup: 'dealer' as const },
  { characterNum: 10, weaponTypeId: 1, roleGroup: 'bruiser' as const },
  { characterNum: 56, weaponTypeId: 20, roleGroup: 'bruiser' as const },
] as const

export const COMPARISON_TARGETS: CaptureTarget[] = COMPARISON_TARGET_SPECS.map((target) => ({
  ...target,
  label: formatComboDisplayName(target.characterNum, target.weaponTypeId),
}))

export interface CaptureCliOptions {
  maxPerCombination: number
  maxGames: number
  dryRun: boolean
  gameIdOverride: string | null
  regenerateReport: boolean
}

export function parseCaptureCliArgs(argv: string[]): CaptureCliOptions {
  let maxPerCombination = 5
  let maxGames = 60
  let dryRun = false
  let gameIdOverride: string | null = null
  let regenerateReport = false

  for (const arg of argv) {
    if (arg === '--dry-run') dryRun = true
    else if (arg === '--regenerate-report') regenerateReport = true
    else if (arg.startsWith('--max-per-combination=')) {
      maxPerCombination = Math.max(1, Number(arg.split('=')[1]) || 5)
    } else if (arg.startsWith('--max-games=')) {
      maxGames = Math.max(1, Number(arg.split('=')[1]) || 60)
    } else if (arg.startsWith('--game-id=')) {
      gameIdOverride = arg.split('=')[1]?.trim() || null
    }
  }

  return { maxPerCombination, maxGames, dryRun, gameIdOverride, regenerateReport }
}

export function buildCaptureTargets(): CaptureTarget[] {
  return [
    ...TANK_TARGETS.map((target) => ({
      characterNum: target.characterNum,
      weaponTypeId: target.weaponTypeId,
      label: formatComboDisplayName(target.characterNum, target.weaponTypeId),
      roleGroup: 'tanker' as const,
    })),
    ...SUPPORT_TARGETS.map((target) => ({
      characterNum: target.characterNum,
      weaponTypeId: target.weaponTypeId,
      label: formatComboDisplayName(target.characterNum, target.weaponTypeId),
      roleGroup: 'supporter' as const,
    })),
    ...COMPARISON_TARGETS,
  ]
}

export function resolveCaptureRoleGroup(role: string | undefined): CaptureRoleGroup {
  if (!role) return 'other'
  if (role.includes('탱커')) return 'tanker'
  if (role.includes('서포터')) return 'supporter'
  if (role.includes('딜러')) return 'dealer'
  if (role.includes('브루저')) return 'bruiser'
  return 'other'
}

export interface DbGameCandidate {
  gameId: string
  uid: string
  characterNum: number
  weaponTypeId: number
}

export interface PlannedSample extends CaptureTarget {
  gameId: string
  uid: string
}

export function dedupePlannedSamples(
  samples: PlannedSample[],
  maxGames: number,
): { selected: PlannedSample[]; skipped: Array<{ gameId: string; reason: string }> } {
  const selected: PlannedSample[] = []
  const skipped: Array<{ gameId: string; reason: string }> = []
  const usedGameIds = new Set<string>()

  for (const sample of samples) {
    if (usedGameIds.has(sample.gameId)) {
      selected.push(sample)
      continue
    }
    if (usedGameIds.size >= maxGames) {
      skipped.push({ gameId: sample.gameId, reason: 'max-games-cap' })
      continue
    }
    usedGameIds.add(sample.gameId)
    selected.push(sample)
  }

  return { selected, skipped }
}

export class CaptureAliasRegistry {
  private gameCounter = 0
  private userCounter = 0
  private readonly gameMap = new Map<string, string>()
  private readonly userMap = new Map<string, string>()

  aliasGameId(gameId: string): string {
    const existing = this.gameMap.get(gameId)
    if (existing) return existing
    this.gameCounter += 1
    const alias = `SAMPLE_GAME_${String(this.gameCounter).padStart(3, '0')}`
    this.gameMap.set(gameId, alias)
    return alias
  }

  aliasUserNum(userNum: string | number | null | undefined): string | null {
    if (userNum == null || userNum === '') return null
    const key = String(userNum)
    const existing = this.userMap.get(key)
    if (existing) return existing
    this.userCounter += 1
    const alias = `SAMPLE_USER_${String(this.userCounter).padStart(3, '0')}`
    this.userMap.set(key, alias)
    return alias
  }
}

const CAPTURE_SENSITIVE_KEYS =
  /^(nickname|userNum|userId|uid|accountId|playerId|apiKey|x-api-key|authorization|token|accessToken|refreshToken|ip|session)$/i

export function redactCaptureRecord(
  value: unknown,
  registry: CaptureAliasRegistry,
  depth = 0,
): unknown {
  if (depth > 10) return '[truncated]'
  if (value === null || value === undefined) return value
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'string') {
    if (value.length > 160) return `${value.slice(0, 160)}…`
    return value
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactCaptureRecord(item, registry, depth + 1))
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value)) {
      if (key === 'gameId' && (typeof child === 'number' || typeof child === 'string')) {
        out[key] = registry.aliasGameId(String(child))
        continue
      }
      if (key === 'userNum' && (typeof child === 'number' || typeof child === 'string')) {
        out[key] = registry.aliasUserNum(child)
        continue
      }
      if (CAPTURE_SENSITIVE_KEYS.test(key)) {
        out[key] = '[redacted]'
        continue
      }
      if (/api[_-]?key|authorization|token|matchingteammode/i.test(key)) {
        out[key] = '[redacted]'
        continue
      }
      out[key] = redactCaptureRecord(child, registry, depth + 1)
    }
    return out
  }
  return String(value)
}

export function pickParticipantRow(
  games: ReadonlyArray<Record<string, unknown>>,
  target: { characterNum: number; weaponTypeId: number; uid?: string | null },
): Record<string, unknown> | null {
  const candidates = games.filter((row) => {
    const characterNum = row.characterNum
    const weapon =
      typeof row.bestWeapon === 'number'
        ? row.bestWeapon
        : typeof row.weaponType === 'number'
          ? row.weaponType
          : null
    return characterNum === target.characterNum && weapon === target.weaponTypeId
  })

  if (candidates.length === 0) return null

  if (target.uid) {
    const byUid = candidates.find((row) => {
      const uid = row.uid ?? row.userId
      return typeof uid === 'string' && uid === target.uid
    })
    if (byUid) return byUid
  }

  return candidates[0] ?? null
}

export interface CaptureSampleRecord {
  sampleGameAlias: string
  sampleUserAlias: string | null
  characterNum: number
  weaponTypeId: number
  roleGroup: CaptureRoleGroup
  comboLabel: string
  payload: unknown
}

export interface MetricSummary {
  count: number
  average: number | null
  min: number | null
  max: number | null
  nonZeroRatio: number | null
}

export interface CaptureFieldEntry {
  path: string
  types: string[]
  presentCount: number
  numericCount: number
  nonZeroCount: number
  min: number | null
  max: number | null
  average: number | null
  categories: string[]
  semantics: ReturnType<typeof inferHealDamageSemantics>
  roles: Partial<Record<CaptureRoleGroup, MetricSummary>>
}

function observeRoleNumeric(
  bucket: { sum: number; count: number; nonZero: number; min: number | null; max: number | null },
  value: unknown,
): void {
  if (!isNumericValue(value)) return
  bucket.sum += value
  bucket.count += 1
  if (value !== 0) bucket.nonZero += 1
  if (bucket.min === null || value < bucket.min) bucket.min = value
  if (bucket.max === null || value > bucket.max) bucket.max = value
}

function finalizeRoleSummary(bucket: {
  sum: number
  count: number
  nonZero: number
  min: number | null
  max: number | null
}): MetricSummary {
  return {
    count: bucket.count,
    average: bucket.count > 0 ? bucket.sum / bucket.count : null,
    min: bucket.min,
    max: bucket.max,
    nonZeroRatio: bucket.count > 0 ? bucket.nonZero / bucket.count : null,
  }
}

export function buildCaptureFieldInventory(samples: CaptureSampleRecord[]): CaptureFieldEntry[] {
  const fields = new Map<
    string,
    {
      types: Set<string>
      presentCount: number
      numericCount: number
      nonZeroCount: number
      min: number | null
      max: number | null
      numericSum: number
      categories: string[]
      semantics: ReturnType<typeof inferHealDamageSemantics>
      roles: Record<CaptureRoleGroup, { sum: number; count: number; nonZero: number; min: number | null; max: number | null }>
    }
  >()

  for (const sample of samples) {
    const pathValues = collectPathValues(sample.payload)
    for (const [path, values] of pathValues.entries()) {
      if (path === '') continue
      if (!fields.has(path)) {
        fields.set(path, {
          types: new Set<string>(),
          presentCount: 0,
          numericCount: 0,
          nonZeroCount: 0,
          min: null,
          max: null,
          numericSum: 0,
          categories: classifyFieldCategories(path),
          semantics: inferHealDamageSemantics(path),
          roles: {
            tanker: { sum: 0, count: 0, nonZero: 0, min: null, max: null },
            supporter: { sum: 0, count: 0, nonZero: 0, min: null, max: null },
            dealer: { sum: 0, count: 0, nonZero: 0, min: null, max: null },
            bruiser: { sum: 0, count: 0, nonZero: 0, min: null, max: null },
            other: { sum: 0, count: 0, nonZero: 0, min: null, max: null },
          },
        })
      }
      const acc = fields.get(path)
      if (!acc) continue

      acc.presentCount += 1
      const representative = pickRepresentativeValue(values)
      acc.types.add(describeValueType(representative))
      if (isNumericValue(representative)) {
        acc.numericCount += 1
        acc.numericSum += representative
        if (representative !== 0) acc.nonZeroCount += 1
        if (acc.min === null || representative < acc.min) acc.min = representative
        if (acc.max === null || representative > acc.max) acc.max = representative
      }
      observeRoleNumeric(acc.roles[sample.roleGroup], representative)
    }
  }

  return [...fields.entries()]
    .map(([path, acc]) => ({
      path,
      types: [...acc.types].sort(),
      presentCount: acc.presentCount,
      numericCount: acc.numericCount,
      nonZeroCount: acc.nonZeroCount,
      min: acc.min,
      max: acc.max,
      average: acc.numericCount > 0 ? acc.numericSum / acc.numericCount : null,
      categories: acc.categories,
      semantics: acc.semantics,
      roles: Object.fromEntries(
        (Object.keys(acc.roles) as CaptureRoleGroup[]).map((role) => [
          role,
          acc.roles[role].count > 0 ? finalizeRoleSummary(acc.roles[role]) : undefined,
        ]),
      ),
    }))
    .sort((a, b) => a.path.localeCompare(b.path))
}

export function buildRoleComparison(samples: CaptureSampleRecord[]): Record<
  CaptureRoleGroup,
  { sampleCount: number; topNumericFields: Array<{ path: string; average: number | null }> }
> {
  const inventory = buildCaptureFieldInventory(samples)
  const numericFields = inventory.filter((field) => field.numericCount > 0 && pathMatchesKeyword(field.path))
  const groups: CaptureRoleGroup[] = ['tanker', 'supporter', 'dealer', 'bruiser']

  const out = {} as Record<
    CaptureRoleGroup,
    { sampleCount: number; topNumericFields: Array<{ path: string; average: number | null }> }
  >

  for (const group of groups) {
    const sampleCount = samples.filter((sample) => sample.roleGroup === group).length
    const topNumericFields = numericFields
      .filter((field) => field.roles[group]?.count)
      .map((field) => ({ path: field.path, average: field.roles[group]?.average ?? null }))
      .sort((a, b) => Math.abs(b.average ?? 0) - Math.abs(a.average ?? 0))
      .slice(0, 15)
    out[group] = { sampleCount, topNumericFields }
  }

  return out
}

function fieldStatFromCapture(entry: CaptureFieldEntry): FieldStat {
  return {
    path: entry.path,
    totalMatches: entry.presentCount,
    existsCount: entry.presentCount,
    nonNullCount: entry.presentCount,
    numericCount: entry.numericCount,
    existenceRate: 1,
    observedTypes: entry.types,
    min: entry.min,
    max: entry.max,
    average: entry.average,
    nonZeroRatio: entry.numericCount > 0 ? entry.nonZeroCount / entry.numericCount : null,
    tankAverage: entry.roles.tanker?.average ?? null,
    supportAverage: entry.roles.supporter?.average ?? null,
    dealerAverage: entry.roles.dealer?.average ?? null,
    flatDealerAverage: null,
    skillDealerAverage: null,
    sampleValues: [],
    combinations: [],
    keywordMatch: pathMatchesKeyword(entry.path),
    categories: entry.categories,
    semantics: entry.semantics,
  }
}

export interface CaptureReportInput {
  generatedAt: string
  apiCallCount: number
  capturedMatchCount: number
  sampleCounts: Record<string, number>
  failures: Array<{ reason: string; detail?: string }>
  inventory: CaptureFieldEntry[]
  apiKeyPresent: boolean
  dryRun: boolean
  responseShape: string[]
}

export function buildCaptureTextReport(input: CaptureReportInput): string {
  const lines: string[] = []
  lines.push('=== ERCraft Role Metric BSER Capture (39.11D) ===')
  lines.push(`generatedAt: ${input.generatedAt}`)
  lines.push('')

  lines.push('1. API 호출 수')
  lines.push(`   total: ${input.apiCallCount}`)
  lines.push(`   dryRun: ${input.dryRun}`)
  lines.push(`   apiKeyPresent: ${input.apiKeyPresent}`)
  lines.push('')

  lines.push('2. 확보한 실제 경기 수')
  lines.push(`   captured samples: ${input.capturedMatchCount}`)
  lines.push('')

  lines.push('3. 조합별 표본 수')
  for (const [key, count] of Object.entries(input.sampleCounts).sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push(`   ${key}: ${count}`)
  }
  lines.push('')

  lines.push('4. 공식 API 응답 구조')
  if (input.responseShape.length === 0) lines.push('   (표본 없음)')
  else for (const key of input.responseShape.slice(0, 40)) lines.push(`   - ${key}`)
  if (input.responseShape.length > 40) lines.push(`   … 외 ${input.responseShape.length - 40}개`)
  lines.push('')

  const byCategory = (category: string) =>
    input.inventory.filter((field) => field.categories.includes(category) || matchesExtendedCategory(field.path, category))

  lines.push('5. 받은 피해 후보')
  for (const field of byCategory('tank')) lines.push(`   ${field.path} avg=${field.average}`)
  if (byCategory('tank').length === 0) lines.push('   (후보 없음)')
  lines.push('')

  lines.push('6. 아군 회복 후보')
  for (const field of input.inventory.filter((f) => f.semantics.allyHeal)) lines.push(`   ${field.path}`)
  if (input.inventory.filter((f) => f.semantics.allyHeal).length === 0) lines.push('   (명시적 ally heal 경로 없음)')
  lines.push('')

  lines.push('7. 자기 회복 후보')
  for (const field of input.inventory.filter((f) => f.semantics.selfHeal)) lines.push(`   ${field.path}`)
  if (input.inventory.filter((f) => f.semantics.selfHeal).length === 0) lines.push('   (명시적 self heal 경로 없음)')
  lines.push('')

  lines.push('8. 음식 회복 후보')
  for (const field of input.inventory.filter((f) => f.semantics.foodHeal)) lines.push(`   ${field.path}`)
  if (input.inventory.filter((f) => f.semantics.foodHeal).length === 0) lines.push('   (명시적 food heal 경로 없음)')
  lines.push('')

  lines.push('9. 보호막 제공 후보')
  for (const field of input.inventory.filter((f) => f.semantics.shieldGrant)) lines.push(`   ${field.path}`)
  if (input.inventory.filter((f) => f.semantics.shieldGrant).length === 0) lines.push('   (후보 없음)')
  lines.push('')

  lines.push('10. 보호막 흡수 후보')
  for (const field of input.inventory.filter((f) => f.semantics.shieldAbsorb)) lines.push(`   ${field.path}`)
  if (input.inventory.filter((f) => f.semantics.shieldAbsorb).length === 0) lines.push('   (후보 없음)')
  lines.push('')

  lines.push('11. CC 후보')
  for (const field of byCategory('cc')) lines.push(`   ${field.path}`)
  if (byCategory('cc').length === 0) lines.push('   (후보 없음)')
  lines.push('')

  lines.push('12. 탱커·서포터·딜러 평균 비교 (keyword numeric)')
  for (const field of input.inventory.filter((f) => f.numericCount > 0 && pathMatchesKeyword(f.path)).slice(0, 25)) {
    lines.push(
      `   ${field.path} tanker=${field.roles.tanker?.average ?? 'n/a'} supporter=${field.roles.supporter?.average ?? 'n/a'} dealer=${field.roles.dealer?.average ?? 'n/a'} bruiser=${field.roles.bruiser?.average ?? 'n/a'}`,
    )
  }
  lines.push('')

  lines.push('13. 점수에 사용할 가능성이 높은 후보 (자동 확정 아님)')
  const usable = input.inventory
    .map((field) => ({ field, verdict: isLikelyUsableCandidate(field.path, fieldStatFromCapture(field)) }))
    .filter((entry) => entry.verdict.usable)
  if (usable.length === 0) lines.push('   확정 후보 없음')
  else for (const { field } of usable.slice(0, 20)) lines.push(`   ${field.path}`)
  lines.push('')

  lines.push('14. 사용하면 안 되는 후보와 이유')
  const rejected = input.inventory
    .map((field) => ({ field, verdict: isLikelyUsableCandidate(field.path, fieldStatFromCapture(field)) }))
    .filter((entry) => !entry.verdict.usable && pathMatchesKeyword(entry.field.path))
  if (rejected.length === 0) lines.push('   (키워드 후보 없음 또는 거부 규칙 미적용)')
  else for (const { field, verdict } of rejected.slice(0, 20)) lines.push(`   ${field.path}: ${verdict.reason}`)
  lines.push('')

  lines.push('15. 공식 API에 존재하지 않는 지표')
  const missing: string[] = []
  if (!input.inventory.some((field) => /heal/i.test(field.path))) missing.push('회복량')
  if (!input.inventory.some((field) => /shield|barrier/i.test(field.path))) missing.push('보호막')
  if (!input.inventory.some((field) => /crowd|cc|stun|snare|root|silence/i.test(field.path))) missing.push('군중제어')
  if (!input.inventory.some((field) => /damagefrom|damagetaken|damagereceived/i.test(field.path))) {
    missing.push('받은 피해(탱킹) — damageFromPlayer만 존재할 수 있음')
  }
  if (missing.length === 0) missing.push('키워드 기준 누락 없음 — 의미 검증 필요')
  for (const item of missing) lines.push(`   - ${item}`)
  lines.push('')

  lines.push('16. 다음 단계 권장안')
  if (input.capturedMatchCount === 0) {
    lines.push('   - BSER_API_KEY 및 DB 표본 확인 후 재실행')
  } else {
    lines.push('   - 아군 회복·보호막·CC 분리 필드만 39.11E 후보로 승격')
    lines.push('   - damageFromPlayer 단독은 탱킹 확정 지표로 사용하지 말 것')
  }
  lines.push('')

  if (input.failures.length > 0) {
    lines.push('--- failures ---')
    for (const failure of input.failures) {
      lines.push(`   ${failure.reason}${failure.detail ? `: ${failure.detail}` : ''}`)
    }
  }

  return lines.join('\n')
}

function matchesExtendedCategory(path: string, category: string): boolean {
  const lower = path.toLowerCase()
  if (category === 'tank') {
    return /damagetaken|damagefrom|damagereceived|damagemitigation|defensecontribution|survivaltime|timespentincombat/.test(
      lower,
    )
  }
  if (category === 'heal') return /heal|recovery|recover|restore|hprecover/.test(lower)
  if (category === 'shield') return /shield|barrier|absorb|protect/.test(lower)
  if (category === 'cc') {
    return /crowdcontrol|cctime|stun|slow|root|snare|taunt|airborne|knock|silence|bind/.test(lower)
  }
  return false
}

export function collectResponseShape(games: ReadonlyArray<Record<string, unknown>>): string[] {
  const keys = new Set<string>()
  for (const row of games) {
    for (const key of Object.keys(row)) keys.add(key)
  }
  return [...keys].sort()
}

export function loadRoleMapFromCaptureJson(
  entries: Record<string, { role?: string }>,
): Map<string, string> {
  return loadRoleMapFromJson(entries)
}
