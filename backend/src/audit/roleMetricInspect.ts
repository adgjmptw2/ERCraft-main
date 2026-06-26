export type RoleBucket = 'tank' | 'support' | 'flatDealer' | 'skillDealer' | 'other'

export const ROLE_METRIC_KEYWORDS = [
  'heal',
  'healing',
  'healed',
  'recovery',
  'recover',
  'restore',
  'shield',
  'barrier',
  'absorb',
  'protect',
  'damageTaken',
  'damageReceived',
  'damageReceive',
  'receivedDamage',
  'damageReduce',
  'damageMitigation',
  'damageFrom',
  'damageTo',
  'fromPlayer',
  'fromMonster',
  'toPlayer',
  'toMonster',
  'tank',
  'cc',
  'crowd',
  'stun',
  'slow',
  'root',
  'snare',
  'taunt',
  'knock',
  'airborne',
  'silence',
  'bind',
  'assist',
  'teamKill',
  'vision',
  'view',
] as const

export const TANK_TARGETS = [
  { characterNum: 30, weaponTypeId: 13 },
  { characterNum: 76, weaponTypeId: 3 },
  { characterNum: 68, weaponTypeId: 1 },
  { characterNum: 55, weaponTypeId: 14 },
  { characterNum: 45, weaponTypeId: 4 },
  { characterNum: 85, weaponTypeId: 13 },
] as const

export const SUPPORT_TARGETS = [
  { characterNum: 73, weaponTypeId: 24 },
  { characterNum: 69, weaponTypeId: 9 },
  { characterNum: 66, weaponTypeId: 24 },
  { characterNum: 62, weaponTypeId: 11 },
  { characterNum: 51, weaponTypeId: 22 },
  { characterNum: 41, weaponTypeId: 24 },
] as const

export const DEFAULT_FLAT_DEALER = {
  characterNum: 8,
  weaponTypeId: 22,
} as const

export const DEFAULT_SKILL_DEALER = {
  characterNum: 60,
  weaponTypeId: 6,
} as const

const SENSITIVE_KEY_PATTERN =
  /^(nickname|userNum|userId|uid|apiKey|x-api-key|authorization|token|accessToken|refreshToken)$/i

const PII_VALUE_KEYS = new Set([
  'nickname',
  'userNum',
  'userId',
  'uid',
  'accountId',
  'playerId',
])

export interface RoleMetricMatchInput {
  rawJson: unknown
  characterNum: number
  bestWeapon: number | null
  roleBucket: RoleBucket
  comboLabel?: string
}

export interface FieldSemantics {
  selfHeal: boolean
  allyHeal: boolean
  totalHeal: boolean
  foodHeal: boolean
  skillHeal: boolean
  shieldGrant: boolean
  shieldAbsorb: boolean
  playerDamageTaken: boolean
  monsterDamageTaken: boolean
  totalDamageTaken: boolean
  damageReduced: boolean
  preDeathDamage: boolean
  survivalTime: boolean
}

export interface FieldStat {
  path: string
  totalMatches: number
  existsCount: number
  nonNullCount: number
  numericCount: number
  existenceRate: number
  observedTypes: string[]
  min: number | null
  max: number | null
  average: number | null
  nonZeroRatio: number | null
  tankAverage: number | null
  supportAverage: number | null
  dealerAverage: number | null
  flatDealerAverage: number | null
  skillDealerAverage: number | null
  sampleValues: unknown[]
  combinations: string[]
  keywordMatch: boolean
  categories: string[]
  semantics: FieldSemantics
}

export interface FieldInventory {
  generatedAt: string
  investigatedMatchCount: number
  fieldCount: number
  keywordFieldCount: number
  numericFieldCount: number
  fields: FieldStat[]
  keywordFields: FieldStat[]
  numericFields: FieldStat[]
  dbStats?: {
    totalPlayerMatches: number
    playerMatchesWithRawJson: number
  }
}

export function parseRawJson(
  raw: unknown,
): { ok: true; value: unknown } | { ok: false; reason: string } {
  if (raw === null || raw === undefined) {
    return { ok: false, reason: 'null-or-undefined' }
  }
  if (typeof raw === 'string') {
    try {
      return { ok: true, value: JSON.parse(raw) as unknown }
    } catch {
      return { ok: false, reason: 'invalid-json-string' }
    }
  }
  if (typeof raw === 'object') {
    return { ok: true, value: raw }
  }
  return { ok: false, reason: 'unsupported-type' }
}

export function formatPath(segments: string[]): string {
  return segments
    .map((segment) => (segment === '[]' ? '[]' : segment))
    .join('.')
    .replace(/\.\[\]/g, '[]')
    .replace(/^\[\]\./, '[]')
}

export function pathMatchesKeyword(path: string): boolean {
  const lower = path.toLowerCase()
  return ROLE_METRIC_KEYWORDS.some((keyword) => lower.includes(keyword.toLowerCase()))
}

export function classifyFieldCategories(path: string): string[] {
  const lower = path.toLowerCase()
  const categories = new Set<string>()

  if (/heal|healing|healed|recovery|recover|restore/.test(lower)) categories.add('heal')
  if (/shield|barrier|absorb|protect/.test(lower)) categories.add('shield')
  if (
    /damageTaken|damagereceived|damagereceive|receiveddamage|damagereduce|damagemitigation|damagefrom|tank/.test(
      lower,
    )
  ) {
    categories.add('tank')
  }
  if (/cc|crowd|stun|slow|root|snare|taunt|knock|airborne|silence|bind/.test(lower)) {
    categories.add('cc')
  }
  if (/assist|teamkill|vision|view/.test(lower)) categories.add('supportVision')

  return [...categories]
}

export function inferHealDamageSemantics(path: string): FieldSemantics {
  const lower = path.toLowerCase()
  return {
    selfHeal: /self|own|playerheal|healtoplayer|healself|selfrecovery/.test(lower),
    allyHeal: /ally|team|other|friend|party|teammate|healtoother|healothers|supportheal/.test(
      lower,
    ),
    totalHeal: /total|all|sum|overall/.test(lower) && /heal|recovery|restore/.test(lower),
    foodHeal: /food|consumable|item|potion|meal|vf|vfcredit|gainvf/.test(lower),
    skillHeal: /skill|ability|spell|active|passive|ultimate|tactical/.test(lower),
    shieldGrant:
      /shield|barrier|protect/.test(lower) && !/absorb|mitig|reduce|from/.test(lower),
    shieldAbsorb:
      /absorb|mitig|block|negat/.test(lower) && /shield|barrier|protect|damage/.test(lower),
    playerDamageTaken:
      /fromplayer|playerdamage|damageto/.test(lower) && /from|receive|taken/.test(lower),
    monsterDamageTaken:
      /monster|animal|mob|pve|wild/.test(lower) && /damage|from|receive|taken/.test(lower),
    totalDamageTaken:
      /total|all|sum|overall/.test(lower) && /damage|taken|receive/.test(lower),
    damageReduced: /reduce|mitig|decrease|prevent/.test(lower),
    preDeathDamage: /beforedeath|predeath|predmg|last/.test(lower),
    survivalTime: /surviv|lifetime|liveduration|playtime|duration|timealive/.test(lower),
  }
}

export function describeValueType(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

export function collectPathValues(root: unknown): Map<string, unknown[]> {
  const paths = new Map<string, unknown[]>()

  function walk(node: unknown, segments: string[]): void {
    const path = formatPath(segments)
    if (!paths.has(path)) paths.set(path, [])
    paths.get(path)?.push(node)

    if (node === null || node === undefined) return

    if (Array.isArray(node)) {
      for (const item of node) {
        walk(item, [...segments, '[]'])
      }
      return
    }

    if (typeof node === 'object') {
      for (const [key, child] of Object.entries(node)) {
        if (SENSITIVE_KEY_PATTERN.test(key)) continue
        walk(child, [...segments, key])
      }
    }
  }

  walk(root, [])
  return paths
}

export function isNumericValue(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

interface FieldAccumulator {
  path: string
  totalMatches: number
  existsCount: number
  nonNullCount: number
  numericCount: number
  observedTypes: Set<string>
  min: number | null
  max: number | null
  numericSum: number
  nonZeroNumericCount: number
  roleBuckets: Record<RoleBucket, { sum: number; count: number }>
  sampleValues: unknown[]
  combinations: Set<string>
  keywordMatch: boolean
  categories: string[]
  semantics: FieldSemantics
}

function createFieldAccumulator(path: string): FieldAccumulator {
  return {
    path,
    totalMatches: 0,
    existsCount: 0,
    nonNullCount: 0,
    numericCount: 0,
    observedTypes: new Set<string>(),
    min: null,
    max: null,
    numericSum: 0,
    nonZeroNumericCount: 0,
    roleBuckets: {
      tank: { sum: 0, count: 0 },
      support: { sum: 0, count: 0 },
      flatDealer: { sum: 0, count: 0 },
      skillDealer: { sum: 0, count: 0 },
      other: { sum: 0, count: 0 },
    },
    sampleValues: [],
    combinations: new Set<string>(),
    keywordMatch: pathMatchesKeyword(path),
    categories: classifyFieldCategories(path),
    semantics: inferHealDamageSemantics(path),
  }
}

function observeMatchField(
  acc: FieldAccumulator,
  value: unknown,
  roleBucket: RoleBucket,
  combinationKey: string,
): void {
  acc.totalMatches += 1
  acc.existsCount += 1
  acc.combinations.add(combinationKey)

  const valueType = describeValueType(value)
  acc.observedTypes.add(valueType)

  if (value !== null && value !== undefined) {
    acc.nonNullCount += 1
  }

  if (isNumericValue(value)) {
    acc.numericCount += 1
    acc.numericSum += value
    if (value !== 0) acc.nonZeroNumericCount += 1
    if (acc.min === null || value < acc.min) acc.min = value
    if (acc.max === null || value > acc.max) acc.max = value

    const bucket = acc.roleBuckets[roleBucket]
    bucket.sum += value
    bucket.count += 1

    if (acc.sampleValues.length < 5 && !acc.sampleValues.includes(value)) {
      acc.sampleValues.push(value)
    }
  } else if (acc.sampleValues.length < 5 && value !== null && value !== undefined) {
    const serialized = JSON.stringify(value)
    if (serialized && !acc.sampleValues.some((entry) => JSON.stringify(entry) === serialized)) {
      acc.sampleValues.push(value)
    }
  }
}

export function pickRepresentativeValue(values: unknown[]): unknown {
  const scalars = values.filter((value) => value === null || typeof value !== 'object')
  const candidates = scalars.length > 0 ? scalars : values
  const numeric = candidates.find((value) => isNumericValue(value))
  if (numeric !== undefined) return numeric
  return candidates.find((value) => value !== null && value !== undefined) ?? null
}

function bucketAverage(bucket: { sum: number; count: number }): number | null {
  if (bucket.count === 0) return null
  return bucket.sum / bucket.count
}

export function finalizeFieldStat(acc: FieldAccumulator): FieldStat {
  const dealerSum = acc.roleBuckets.flatDealer.sum + acc.roleBuckets.skillDealer.sum
  const dealerCount = acc.roleBuckets.flatDealer.count + acc.roleBuckets.skillDealer.count

  return {
    path: acc.path,
    totalMatches: acc.totalMatches,
    existsCount: acc.existsCount,
    nonNullCount: acc.nonNullCount,
    numericCount: acc.numericCount,
    existenceRate: acc.totalMatches > 0 ? acc.existsCount / acc.totalMatches : 0,
    observedTypes: [...acc.observedTypes].sort(),
    min: acc.min,
    max: acc.max,
    average: acc.numericCount > 0 ? acc.numericSum / acc.numericCount : null,
    nonZeroRatio: acc.numericCount > 0 ? acc.nonZeroNumericCount / acc.numericCount : null,
    tankAverage: bucketAverage(acc.roleBuckets.tank),
    supportAverage: bucketAverage(acc.roleBuckets.support),
    dealerAverage: dealerCount > 0 ? dealerSum / dealerCount : null,
    flatDealerAverage: bucketAverage(acc.roleBuckets.flatDealer),
    skillDealerAverage: bucketAverage(acc.roleBuckets.skillDealer),
    sampleValues: acc.sampleValues.slice(0, 5),
    combinations: [...acc.combinations].sort(),
    keywordMatch: acc.keywordMatch,
    categories: acc.categories,
    semantics: acc.semantics,
  }
}

export function buildFieldInventory(matches: RoleMetricMatchInput[]): FieldInventory {
  const fields = new Map<string, FieldAccumulator>()

  for (const match of matches) {
    const parsed = parseRawJson(match.rawJson)
    const combinationKey = `${match.characterNum}:${match.bestWeapon ?? 'null'}`
    if (!parsed.ok) continue

    const pathValues = collectPathValues(parsed.value)

    for (const [path, values] of pathValues.entries()) {
      if (path === '') continue
      if (!fields.has(path)) fields.set(path, createFieldAccumulator(path))
      const acc = fields.get(path)
      if (!acc) continue
      const representative = pickRepresentativeValue(values)
      observeMatchField(acc, representative, match.roleBucket, combinationKey)
    }
  }

  const allStats = [...fields.values()].map(finalizeFieldStat)
  allStats.sort((a, b) => a.path.localeCompare(b.path))

  const keywordFields = allStats.filter((field) => field.keywordMatch)
  const numericFields = allStats.filter((field) => field.numericCount > 0)

  return {
    generatedAt: new Date().toISOString(),
    investigatedMatchCount: matches.length,
    fieldCount: allStats.length,
    keywordFieldCount: keywordFields.length,
    numericFieldCount: numericFields.length,
    fields: allStats,
    keywordFields,
    numericFields,
  }
}

export function redactSensitive(value: unknown, depth = 0): unknown {
  if (depth > 8) return '[truncated]'
  if (value === null || value === undefined) return value
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'string') {
    if (value.length > 120) return `${value.slice(0, 120)}…`
    return value
  }
  if (Array.isArray(value)) {
    return value.slice(0, 3).map((item) => redactSensitive(item, depth + 1))
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value)) {
      if (SENSITIVE_KEY_PATTERN.test(key) || PII_VALUE_KEYS.has(key)) {
        out[key] = '[redacted]'
        continue
      }
      if (/api[_-]?key|authorization|token/i.test(key)) {
        out[key] = '[redacted]'
        continue
      }
      out[key] = redactSensitive(child, depth + 1)
    }
    return out
  }
  return String(value)
}

export function buildRedactedSamples(matches: RoleMetricMatchInput[], maxSamples = 12) {
  const samples = []
  for (const match of matches) {
    if (samples.length >= maxSamples) break
    const parsed = parseRawJson(match.rawJson)
    if (!parsed.ok) continue
    samples.push({
      characterNum: match.characterNum,
      weaponTypeId: match.bestWeapon,
      roleBucket: match.roleBucket,
      comboLabel: match.comboLabel ?? null,
      rawJson: redactSensitive(parsed.value),
    })
  }
  return samples
}

export function isLikelyUsableCandidate(
  path: string,
  stat: FieldStat,
): { usable: boolean; reason: string } {
  if (stat.numericCount === 0) return { usable: false, reason: '숫자 값 없음' }
  if (stat.existenceRate < 0.05) return { usable: false, reason: '존재율 5% 미만' }

  const lower = path.toLowerCase()
  if (/nickname|userid|usernum|uid|gameid|token|apikey/.test(lower)) {
    return { usable: false, reason: '식별자/민감 필드' }
  }

  if (stat.semantics.selfHeal && !stat.semantics.allyHeal && !stat.semantics.totalHeal) {
    return { usable: false, reason: '자기 회복만 구분되는 후보 — 서포터 지표로 단정 불가' }
  }
  if (stat.semantics.foodHeal && !stat.semantics.skillHeal && !stat.semantics.allyHeal) {
    return { usable: false, reason: '음식/소모 회복만 구분 — 스킬 회복과 혼동 위험' }
  }
  if (
    /damagetaken|damagefrom|damagereceived/.test(lower) &&
    !stat.semantics.playerDamageTaken &&
    !stat.semantics.monsterDamageTaken &&
    !stat.semantics.totalDamageTaken
  ) {
    return { usable: false, reason: '받은 피해 출처(플레이어/동물/전체) 불명확' }
  }

  return { usable: true, reason: '값·존재율·의미 기준으로 추가 검증 필요(후보)' }
}

function pct(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a'
  return `${(value * 100).toFixed(1)}%`
}

function fmt(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a'
  return Number(value).toFixed(2)
}

function formatFieldLine(field: FieldStat): string {
  return `   ${field.path} | exist=${pct(field.existenceRate)} types=${field.observedTypes.join('/')} num=${field.numericCount} avg=${fmt(field.average)} nz=${pct(field.nonZeroRatio)} tank=${fmt(field.tankAverage)} support=${fmt(field.supportAverage)} dealer=${fmt(field.dealerAverage)} combos=${field.combinations.slice(0, 5).join(',')}`
}

export interface TextReportInput {
  investigatedMatchCount: number
  sampleCounts: Record<string, number>
  excludedCombos: Array<{ combo: string; reason: string; substitute?: string }>
  inventory: FieldInventory
}

export function buildTextReport(input: TextReportInput): string {
  const { investigatedMatchCount, sampleCounts, excludedCombos, inventory } = input
  const lines: string[] = []

  lines.push('=== ERCraft Role Metric rawJson Audit (39.11B) ===')
  lines.push(`generatedAt: ${inventory.generatedAt}`)
  lines.push('')

  lines.push('1. 조사한 PlayerMatch 수')
  lines.push(`   total: ${investigatedMatchCount}`)
  lines.push(
    `   parsed fields: ${inventory.fieldCount} (keyword: ${inventory.keywordFieldCount}, numeric: ${inventory.numericFieldCount})`,
  )
  const dbStats = inventory.dbStats
  if (dbStats) {
    lines.push(
      `   DB PlayerMatch 전체: ${dbStats.totalPlayerMatches}, rawJson 보유: ${dbStats.playerMatchesWithRawJson}`,
    )
  }
  lines.push('')

  lines.push('2. 실험체·무기별 표본 수')
  for (const [key, count] of Object.entries(sampleCounts).sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push(`   ${key}: ${count}`)
  }
  for (const entry of excludedCombos) {
    lines.push(
      `   [제외] ${entry.combo} — ${entry.reason}${entry.substitute ? ` (대체: ${entry.substitute})` : ''}`,
    )
  }
  lines.push('')

  const byCategory = (category: string) =>
    inventory.keywordFields.filter((field) => field.categories.includes(category))

  lines.push('3. 탱킹 후보 필드')
  for (const field of byCategory('tank')) {
    lines.push(formatFieldLine(field))
  }
  if (byCategory('tank').length === 0) lines.push('   (후보 없음)')
  lines.push('')

  lines.push('4. 회복 후보 필드')
  for (const field of byCategory('heal')) {
    lines.push(formatFieldLine(field))
  }
  if (byCategory('heal').length === 0) lines.push('   (후보 없음)')
  lines.push('')

  lines.push('5. 보호막 후보 필드')
  for (const field of byCategory('shield')) {
    lines.push(formatFieldLine(field))
  }
  if (byCategory('shield').length === 0) lines.push('   (후보 없음)')
  lines.push('')

  lines.push('6. CC 후보 필드')
  for (const field of byCategory('cc')) {
    lines.push(formatFieldLine(field))
  }
  if (byCategory('cc').length === 0) lines.push('   (후보 없음)')
  lines.push('')

  lines.push('7. 시야·지원 후보 필드')
  for (const field of byCategory('supportVision')) {
    lines.push(formatFieldLine(field))
  }
  if (byCategory('supportVision').length === 0) lines.push('   (후보 없음)')
  lines.push('')

  lines.push('8. 자기 회복과 아군 회복 구분 가능 여부')
  const healFields = inventory.fields.filter(
    (field) => field.categories.includes('heal') || field.categories.includes('shield'),
  )
  if (healFields.length === 0) {
    lines.push('   rawJson 표본 없음 — 구분 판단 불가')
  } else {
    for (const field of healFields) {
      lines.push(
        `   ${field.path}: self=${field.semantics.selfHeal} ally=${field.semantics.allyHeal} total=${field.semantics.totalHeal} food=${field.semantics.foodHeal} skill=${field.semantics.skillHeal}`,
      )
    }
  }
  lines.push('')

  lines.push('9. 플레이어 피해와 동물 피해 구분 가능 여부')
  const damageFields = inventory.fields.filter(
    (field) => field.categories.includes('tank') || /damage/i.test(field.path),
  )
  if (damageFields.length === 0) {
    lines.push('   rawJson 표본 없음 — 구분 판단 불가')
  } else {
    for (const field of damageFields.slice(0, 40)) {
      lines.push(
        `   ${field.path}: player=${field.semantics.playerDamageTaken} monster=${field.semantics.monsterDamageTaken} total=${field.semantics.totalDamageTaken} reduced=${field.semantics.damageReduced}`,
      )
    }
    if (damageFields.length > 40) lines.push(`   … 외 ${damageFields.length - 40}개 경로`)
  }
  lines.push('')

  lines.push('10. 실제 점수에 사용할 가능성이 높은 필드 (후보 수준, 자동 확정 아님)')
  const usable = inventory.fields
    .map((field) => ({ field, verdict: isLikelyUsableCandidate(field.path, field) }))
    .filter((entry) => entry.verdict.usable)
  if (usable.length === 0) {
    lines.push('   확정 후보 없음 — 표본 또는 필드 부재')
  } else {
    for (const { field } of usable.slice(0, 25)) {
      lines.push(
        `   ${field.path} (exist=${pct(field.existenceRate)}, avg=${fmt(field.average)}, tank=${fmt(field.tankAverage)}, support=${fmt(field.supportAverage)}, dealer=${fmt(field.dealerAverage)})`,
      )
    }
  }
  lines.push('')

  lines.push('11. 사용하면 안 되는 필드와 이유')
  const rejected = inventory.fields
    .map((field) => ({ field, verdict: isLikelyUsableCandidate(field.path, field) }))
    .filter((entry) => !entry.verdict.usable && entry.field.keywordMatch)
  if (rejected.length === 0) {
    lines.push('   키워드 후보 중 명시적 거부 규칙 해당 없음 (표본 부재 가능)')
  } else {
    for (const { field, verdict } of rejected.slice(0, 30)) {
      lines.push(`   ${field.path}: ${verdict.reason}`)
    }
  }
  lines.push('')

  lines.push('12. 필드가 없는 지표')
  const missing: string[] = []
  if (!inventory.fields.some((field) => field.path.toLowerCase().includes('heal'))) {
    missing.push('회복량(명시적 heal 경로)')
  }
  if (!inventory.fields.some((field) => /shield|barrier/.test(field.path.toLowerCase()))) {
    missing.push('보호막 제공/흡수')
  }
  if (
    !inventory.fields.some((field) =>
      /crowd|stun|cc|snare|root|silence/.test(field.path.toLowerCase()),
    )
  ) {
    missing.push('군중제어')
  }
  if (
    !inventory.fields.some((field) =>
      /damagefromplayer|damagefrom|damagetaken/.test(field.path.toLowerCase()),
    )
  ) {
    missing.push('받은 피해(탱킹)')
  }
  if (missing.length === 0) {
    missing.push('키워드 기준 누락 없음 — 의미 구분은 별도 검증 필요')
  }
  for (const item of missing) lines.push(`   - ${item}`)
  lines.push('')

  lines.push('13. 다음 단계 권장안')
  if (investigatedMatchCount === 0) {
    lines.push('   - PlayerMatch.rawJson 저장 경로 활성화(매치 hydration 시 storeRawJson) 후 재조사')
    lines.push('   - MatchDetail.rawJson(30건) 또는 BSER 문서와 대조해 기대 필드명 목록 확정')
  } else {
    lines.push('   - 후보 필드별 탱커/서포터/딜러 분포 비교 및 BSER 문서 대조')
    lines.push('   - 아군 회복·보호막·CC가 분리된 경로만 39.11C 점수식 후보로 승격')
    lines.push('   - 자기/음식 회복 단독 필드는 서포터 점수에서 제외')
  }
  lines.push('')

  lines.push('--- numeric fields (all) ---')
  for (const field of inventory.numericFields.slice(0, 80)) {
    lines.push(formatFieldLine(field))
  }
  if (inventory.numericFields.length > 80) {
    lines.push(`… ${inventory.numericFields.length - 80} more numeric paths in JSON inventory`)
  }

  return lines.join('\n')
}

export function resolveRoleBucket(
  characterNum: number,
  weaponTypeId: number | null,
  roleMap: Map<string, string>,
): RoleBucket {
  if (weaponTypeId == null) return 'other'
  const key = `${characterNum}:${weaponTypeId}`
  const role = roleMap.get(key)
  if (!role) return 'other'
  if (role.includes('탱커')) return 'tank'
  if (role.includes('서포터')) return 'support'
  if (role.includes('평타 딜러')) return 'flatDealer'
  if (role.includes('스증 딜러')) return 'skillDealer'
  return 'other'
}

export function loadRoleMapFromJson(entries: Record<string, { role?: string }>): Map<string, string> {
  const map = new Map<string, string>()
  for (const [key, value] of Object.entries(entries)) {
    if (value && typeof value.role === 'string') map.set(key, value.role)
  }
  return map
}
