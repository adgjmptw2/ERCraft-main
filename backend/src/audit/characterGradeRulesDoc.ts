import rolesDoc from '../data/characterGrade/character-weapon-roles.v1.json' with { type: 'json' }
import {
  OUTCOME_SCORE_WEIGHT,
  ROLE_PRESET_WEIGHTS,
  ROLE_SCORE_WEIGHT,
  sumRoleWeights,
  type CharacterGradeRole,
} from '../services/characterPerformanceGrade/config.js'
import {
  buildCombatShadowPresetC2,
  resolveCombatLivePreset,
  usesFinisherShareInLivePreset,
} from '../services/characterPerformanceGrade/combatParticipationConfig.js'
import {
  COMBAT_CONTRIBUTION_ASSIST_WEIGHT,
  COMBAT_CONTRIBUTION_FORMULA_NOTE,
} from '../services/characterPerformanceGrade/combatParticipation.js'
import {
  buildComboKey,
  isParticipationShadowReady,
  loadCombatParticipationBaselineDocument,
} from '../audit/combatParticipationBaselineBuilder.js'
import {
  HEALER_SUPPORT_COMBO_KEYS,
  buildSupportComboKey,
  resolveSupportSubtype,
} from '../services/characterPerformanceGrade/supportSubtype.js'
import { resolveCharacterDisplayName } from '../utils/characterDisplayName.js'
import { resolveWeaponDisplayName } from '../utils/weaponDisplayName.js'
import { loadRoleMetricBaselineDocument } from './roleMetricBaselineBuilder.js'
import {
  getCombatContributionLiveBlocklist,
  resetCombatContributionLiveCaches,
} from '../services/characterPerformanceGrade/combatContributionLiveGrade.js'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const moduleDir = dirname(fileURLToPath(import.meta.url))

export interface CharacterGradeRuleEntry {
  characterNum: number
  characterName: string
  weaponTypeId: number
  weaponName: string
  numericKey: string
  role: CharacterGradeRole
  supportSubtype: 'healer' | 'utility' | null
  legacyRolePreset: Record<string, number>
  legacyKatkWeightShare: number
  combatContributionFormula: string
  combatAssistWeight: number
  finisherUsed: boolean
  liveRoleModePotential: string
  structuredRoleMetrics: string[]
  liveEligibilitySummary: string
  eligibilityFailureReason: string | null
  baselineKinds: string[]
  combatBaselineReadiness: string
  combatLiveEligibility: string
  combatLiveMode: string
  combatFallbackReason: string | null
  shadowC2Preset: Record<string, number> | null
  notes: string
}

export interface CharacterGradeRulesDocument {
  generatedAt: string
  canonicalCombinationCount: number
  supportCanonicalCount: number
  utilitySupportCanonicalCount: number
  healerCanonicalCount: number
  combatLiveEligibleExactKeyCount: number
  combatLiveBlocklistKeyCount: number
  combatLiveAppliedExactKeyCount: number | null
  entries: CharacterGradeRuleEntry[]
}

function resolveLiveModePotential(
  role: CharacterGradeRole,
  characterNum: number,
  weaponTypeId: number,
): string {
  if (role === '탱커') {
    return 'tank-t2 | tank-t1 | tank-combat-fallback | legacy'
  }
  if (role !== '서포터') {
    const combat = resolveCombatLivePreset(role, characterNum, weaponTypeId)
    return combat ? `${combat.mode} | legacy-k-a-tk` : 'legacy-k-a-tk'
  }
  return resolveSupportSubtype(characterNum, weaponTypeId, role) === 'healer'
    ? 'support-healer-s1 | support-healer-combat | legacy-k-a-tk'
    : 'support-utility-combat | support-utility-legacy | legacy-k-a-tk'
}

function resolveStructuredMetrics(role: CharacterGradeRole, subtype: 'healer' | 'utility' | null): string[] {
  const base = ['viewContribution', 'monsterKill']
  if (role === '탱커') return [...base, 'tankingEfficiency', 'shieldDamageOffsetFromPlayer']
  if (role === '서포터' && subtype === 'healer') return [...base, 'teamRecover']
  if (role === '서포터') return base
  return base
}

function summarizeLiveEligibility(
  characterNum: number,
  weaponTypeId: number,
): { summary: string; failure: string | null } {
  try {
    const document = loadRoleMetricBaselineDocument()
    const combos = Object.values(document.combinations).filter(
      (combo) => combo.characterNum === characterNum && combo.weaponTypeId === weaponTypeId,
    )
    if (combos.length === 0) {
      return { summary: 'no-role-metric-baseline', failure: 'baseline-unavailable' }
    }
    const flags = combos.map((combo) => combo.liveEligibility)
    const tank = flags.some((flag) => flag.tankingEfficiency)
    const shield = flags.some((flag) => flag.shieldDamageOffsetFromPlayer)
    const recover = flags.some((flag) => flag.teamRecover)
    const parts = [
      tank ? 'tankingEfficiency' : null,
      shield ? 'shield' : null,
      recover ? 'teamRecover' : null,
    ].filter(Boolean)
    return {
      summary: parts.length > 0 ? parts.join(', ') : 'none',
      failure: parts.length > 0 ? null : 'bootstrap-or-readiness',
    }
  } catch {
    return { summary: 'baseline-unavailable', failure: 'baseline-unavailable' }
  }
}

function summarizeCombatBaseline(
  characterNum: number,
  weaponTypeId: number,
): { readiness: string; liveEligible: string; fallbackReason: string | null; eligibleKeyCount: number } {
  try {
    const document = loadCombatParticipationBaselineDocument()
    const combos = Object.entries(document.combinations).filter(
      ([, combo]) => combo.characterNum === characterNum && combo.weaponTypeId === weaponTypeId,
    )
    if (combos.length === 0) {
      return {
        readiness: 'unavailable',
        liveEligible: 'no-exact-baseline',
        fallbackReason: 'baseline-unavailable',
        eligibleKeyCount: 0,
      }
    }
    const readinessLevels = combos.map(
      ([, combo]) => combo.metrics['participationAssistWeighted_0.7'].readiness,
    )
    const bestReadiness = readinessLevels.includes('ready')
      ? 'ready'
      : readinessLevels.includes('provisional')
        ? 'provisional'
        : readinessLevels.includes('experimental')
          ? 'experimental'
          : 'unusable'
    const eligibleKeyCount = combos.filter(([, combo]) =>
      isParticipationShadowReady(combo.metrics['participationAssistWeighted_0.7'].readiness),
    ).length
    return {
      readiness: bestReadiness,
      liveEligible: eligibleKeyCount > 0 ? 'provisional-or-ready' : 'readiness-insufficient',
      fallbackReason: eligibleKeyCount > 0 ? null : 'readiness-insufficient',
      eligibleKeyCount,
    }
  } catch {
    return {
      readiness: 'unavailable',
      liveEligible: 'baseline-unavailable',
      fallbackReason: 'baseline-unavailable',
      eligibleKeyCount: 0,
    }
  }
}

function resolveCombatLiveAppliedExactKeyCount(): number | null {
  const auditPath = join(moduleDir, '..', '..', 'tmp', 'grade-rollout-audit', 'by-exact-key.json')
  if (!existsSync(auditPath)) return null
  try {
    const byExactKey = JSON.parse(readFileSync(auditPath, 'utf8')) as Record<
      string,
      { appliedGroupCount?: number }
    >
    return Object.values(byExactKey).filter((entry) => (entry.appliedGroupCount ?? 0) > 0).length
  } catch {
    return null
  }
}

export function buildCharacterGradeRulesDocument(): CharacterGradeRulesDocument {
  const entries: CharacterGradeRuleEntry[] = []
  let supportCount = 0
  let utilityCount = 0
  let healerCount = 0
  let combatEligibleExactKeys = 0

  for (const [numericKey, entry] of Object.entries(rolesDoc.entries)) {
    const role = entry.role as CharacterGradeRole
    const subtype = resolveSupportSubtype(entry.characterNum, entry.weaponTypeId, role)
    if (role === '서포터') {
      supportCount += 1
      if (subtype === 'utility') utilityCount += 1
      if (subtype === 'healer') healerCount += 1
    }
    const eligibility = summarizeLiveEligibility(entry.characterNum, entry.weaponTypeId)
    const combatBaseline = summarizeCombatBaseline(entry.characterNum, entry.weaponTypeId)
    combatEligibleExactKeys += combatBaseline.eligibleKeyCount
    const shadow = buildCombatShadowPresetC2(role, entry.characterNum, entry.weaponTypeId)
    const livePreset = resolveCombatLivePreset(role, entry.characterNum, entry.weaponTypeId)
    const legacy = ROLE_PRESET_WEIGHTS[role]
    const legacyKatk =
      (legacy.playerKill + legacy.playerAssistant + legacy.teamKill) / 100

    entries.push({
      characterNum: entry.characterNum,
      characterName: resolveCharacterDisplayName(entry.characterNum, null),
      weaponTypeId: entry.weaponTypeId,
      weaponName: resolveWeaponDisplayName(entry.weaponTypeId),
      numericKey,
      role,
      supportSubtype: subtype,
      legacyRolePreset: { ...legacy },
      legacyKatkWeightShare: legacyKatk,
      combatContributionFormula: `(playerKill + playerAssistant * ${COMBAT_CONTRIBUTION_ASSIST_WEIGHT}) / teamKill — ${COMBAT_CONTRIBUTION_FORMULA_NOTE}`,
      combatAssistWeight: COMBAT_CONTRIBUTION_ASSIST_WEIGHT,
      finisherUsed: livePreset ? usesFinisherShareInLivePreset(livePreset.preset) : false,
      liveRoleModePotential: resolveLiveModePotential(role, entry.characterNum, entry.weaponTypeId),
      structuredRoleMetrics: resolveStructuredMetrics(role, subtype),
      liveEligibilitySummary: eligibility.summary,
      eligibilityFailureReason: eligibility.failure,
      baselineKinds: ['dakgg-tier-baseline', 'role-metric-exact-combination', 'combat-contribution-exact-combination'],
      combatBaselineReadiness: combatBaseline.readiness,
      combatLiveEligibility: combatBaseline.liveEligible,
      combatLiveMode: livePreset?.mode ?? 'legacy-k-a-tk',
      combatFallbackReason: combatBaseline.fallbackReason,
      shadowC2Preset: shadow.preset,
      notes: shadow.unsupportedReason ?? '',
    })
  }

  entries.sort((a, b) => a.numericKey.localeCompare(b.numericKey))

  resetCombatContributionLiveCaches()
  const blocklist = getCombatContributionLiveBlocklist()

  return {
    generatedAt: new Date().toISOString(),
    canonicalCombinationCount: entries.length,
    supportCanonicalCount: supportCount,
    utilitySupportCanonicalCount: utilityCount,
    healerCanonicalCount: healerCount,
    combatLiveEligibleExactKeyCount: combatEligibleExactKeys,
    combatLiveBlocklistKeyCount: blocklist.blockedExactKeys.length,
    combatLiveAppliedExactKeyCount: resolveCombatLiveAppliedExactKeyCount(),
    entries,
  }
}

export function formatCharacterGradeRulesMarkdown(document: CharacterGradeRulesDocument): string {
  const lines = [
    '# ERCraft Character Grade Rules',
    '',
    `Generated: ${document.generatedAt}`,
    '',
    '## Score structure',
    '',
    `- Final score = outcome ${OUTCOME_SCORE_WEIGHT * 100}% + role ${ROLE_SCORE_WEIGHT * 100}%`,
    '- Sample confidence correction applies after raw score.',
    '- Fewer than 5 valid games → grade not shown.',
    '- DAK.GG static tier baseline for outcome and legacy role metrics.',
    '- Official BSER match fields stored in PlayerMatch; ERCraft aggregates exact-combination baselines.',
    '- Fallback keeps grade visible when live eligibility fails.',
    '- supportSubtype: healer (`41:24`, `73:24`) vs utility (all other supports).',
    `- combatContributionRatio: (playerKill + playerAssistant * ${COMBAT_CONTRIBUTION_ASSIST_WEIGHT}) / teamKill — ${COMBAT_CONTRIBUTION_FORMULA_NOTE}`,
    '- Live priority: H role modes (tank-t2/t1, support-healer-s1) → J combat C3 → legacy K/A/TK.',
    '',
    '## Explainability (39.11K — dev only)',
    '',
    '- combatContributionRatio is a weighted combat contribution ratio, not official kill participation.',
    '- Individual match fields (kills, assists, teamKills, etc.) come from official BSER PlayerMatch rows.',
    '- combatContribution and finisherShare baselines are ERCraft S11 DB aggregations (not DAK.GG).',
    '- DAK.GG tier baselines use periodDays=7 static snapshot; combat baselines use S11 participant rows with separate playedAt span.',
    '- weightedContribution = normalizedScore × weight / 100 (points inside the 100-point role or outcome section).',
    '- Dev grade breakdown: `node scripts/explain-character-grade.mjs --nickname=<nick> --character-num=<n> --weapon-type-id=<w>`',
    '- Rollout audit: `node scripts/audit-grade-rollout.mjs` → `backend/tmp/grade-rollout-audit/`',
    '- Combat preset requires every configured metric to pass coverage gates; missing metrics do not redistribute weight.',
    '- Incomplete combat presets fall back to the full legacy role preset.',
    '- Blocklist safety: mean |Δ|>5, max |Δ|>10, coarse change >10%, two-plus-step >5%, small-sample review-needed.',
    '- viewContribution and monsterKill require structured coverage ≥80% with ≥5 valid games.',
    '',
    '## Counts',
    '',
    `- canonical character+weapon combinations: ${document.canonicalCombinationCount}`,
    `- support canonical combinations: ${document.supportCanonicalCount}`,
    `- utility support canonical: ${document.utilitySupportCanonicalCount}`,
    `- healer support canonical: ${document.healerCanonicalCount}`,
    `- combat live eligible exact baseline keys (provisional+): ${document.combatLiveEligibleExactKeyCount}`,
    `- combat live blocklist exact keys: ${document.combatLiveBlocklistKeyCount}`,
    document.combatLiveAppliedExactKeyCount != null
      ? `- combat live applied exact keys (last rollout audit): ${document.combatLiveAppliedExactKeyCount}`
      : '- combat live applied exact keys: run `node scripts/audit-grade-rollout.mjs` to populate',
    '',
    '## Role legacy weights (sum 100 each)',
    '',
    ...Object.entries(ROLE_PRESET_WEIGHTS).map(
      ([role, weights]) =>
        `- ${role}: ${Object.entries(weights)
          .map(([key, weight]) => `${key} ${weight}`)
          .join(', ')} (sum ${sumRoleWeights(role as CharacterGradeRole)}, K+A+TK share ${((weights.playerKill + weights.playerAssistant + weights.teamKill) / 100 * 100).toFixed(0)}%)`,
    ),
    '',
    '## Combat live C3 presets (39.11J — limited rollout)',
    '',
    ...Object.entries(rolesDoc.entries)
      .slice(0, 0)
      .map(() => ''),
    ...Array.from(
      new Map(
        document.entries.map((entry) => {
          const preset = resolveCombatLivePreset(entry.role, entry.characterNum, entry.weaponTypeId)
          return [entry.role, preset?.preset ?? null] as const
        }),
      ).entries(),
    ).map(([role, preset]) =>
      preset
        ? `- ${role}: ${Object.entries(preset)
            .map(([key, weight]) => `${key} ${weight}`)
            .join(', ')}`
        : `- ${role}: n/a`,
    ),
    '',
    '## 113 combinations',
    '',
    '| characterNum | name | weapon | key | role | finisher | combat readiness | combat live | combat mode | legacy K+A+TK % |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...document.entries.map(
      (entry) =>
        `| ${entry.characterNum} | ${entry.characterName} | ${entry.weaponName} (${entry.weaponTypeId}) | ${entry.numericKey} | ${entry.role} | ${entry.finisherUsed ? 'yes' : 'no'} | ${entry.combatBaselineReadiness} | ${entry.combatLiveEligibility} | ${entry.combatLiveMode} | ${(entry.legacyKatkWeightShare * 100).toFixed(0)}% |`,
    ),
    '',
    'Healer keys (numeric only):',
    ...[...HEALER_SUPPORT_COMBO_KEYS].map((key) => `- \`${key}\``),
    '',
  ]
  return `${lines.join('\n')}\n`
}

export function formatCharacterGradeRulesCsv(document: CharacterGradeRulesDocument): string {
  const header = [
    'characterNum',
    'characterName',
    'weaponTypeId',
    'weaponName',
    'numericKey',
    'role',
    'supportSubtype',
    'legacyKatkWeightShare',
    'combatContributionFormula',
    'combatAssistWeight',
    'finisherUsed',
    'legacyRolePresetJson',
    'liveRoleModePotential',
    'structuredRoleMetrics',
    'liveEligibilitySummary',
    'eligibilityFailureReason',
    'baselineKinds',
    'combatBaselineReadiness',
    'combatLiveEligibility',
    'combatLiveMode',
    'combatFallbackReason',
    'shadowC2PresetJson',
    'notes',
  ]
  const rows = document.entries.map((entry) =>
    [
      entry.characterNum,
      entry.characterName,
      entry.weaponTypeId,
      entry.weaponName,
      entry.numericKey,
      entry.role,
      entry.supportSubtype ?? '',
      entry.legacyKatkWeightShare,
      entry.combatContributionFormula,
      entry.combatAssistWeight,
      entry.finisherUsed,
      JSON.stringify(entry.legacyRolePreset),
      entry.liveRoleModePotential,
      entry.structuredRoleMetrics.join('|'),
      entry.liveEligibilitySummary,
      entry.eligibilityFailureReason ?? '',
      entry.baselineKinds.join('|'),
      entry.combatBaselineReadiness,
      entry.combatLiveEligibility,
      entry.combatLiveMode,
      entry.combatFallbackReason ?? '',
      entry.shadowC2Preset ? JSON.stringify(entry.shadowC2Preset) : '',
      entry.notes,
    ]
      .map((value) => `"${String(value).replace(/"/g, '""')}"`)
      .join(','),
  )
  return `${header.join(',')}\n${rows.join('\n')}\n`
}

export function assertCharacterGradeRulesMatchConfig(document: CharacterGradeRulesDocument): void {
  if (document.canonicalCombinationCount !== 113) {
    throw new Error(`expected 113 canonical combinations, got ${document.canonicalCombinationCount}`)
  }
  for (const entry of document.entries) {
    const expected = ROLE_PRESET_WEIGHTS[entry.role]
    for (const [key, weight] of Object.entries(expected)) {
      if (entry.legacyRolePreset[key] !== weight) {
        throw new Error(`weight mismatch for ${entry.numericKey} ${key}`)
      }
    }
    const expectedSubtype = resolveSupportSubtype(
      entry.characterNum,
      entry.weaponTypeId,
      entry.role,
    )
    if (entry.supportSubtype !== expectedSubtype) {
      throw new Error(`supportSubtype mismatch for ${entry.numericKey}`)
    }
    if (entry.numericKey !== buildSupportComboKey(entry.characterNum, entry.weaponTypeId)) {
      throw new Error(`numeric key mismatch for ${entry.numericKey}`)
    }
    const livePreset = resolveCombatLivePreset(entry.role, entry.characterNum, entry.weaponTypeId)
    if ((livePreset?.mode ?? 'legacy-k-a-tk') !== entry.combatLiveMode) {
      throw new Error(`combat live mode mismatch for ${entry.numericKey}`)
    }
  }
}

export function countCombatEligibleExactKeys(): number {
  try {
    const document = loadCombatParticipationBaselineDocument()
    return Object.values(document.combinations).filter((combo) =>
      isParticipationShadowReady(combo.metrics['participationAssistWeighted_0.7'].readiness),
    ).length
  } catch {
    return 0
  }
}

export function listCombatEligibleExactKeys(): string[] {
  try {
    const document = loadCombatParticipationBaselineDocument()
    return Object.entries(document.combinations)
      .filter(([, combo]) =>
        isParticipationShadowReady(combo.metrics['participationAssistWeighted_0.7'].readiness),
      )
      .map(([key]) => key)
  } catch {
    return []
  }
}

export function buildComboKeyForRules(
  rankTierKey: string,
  characterNum: number,
  weaponTypeId: number,
): string {
  return buildComboKey(rankTierKey, characterNum, weaponTypeId)
}
