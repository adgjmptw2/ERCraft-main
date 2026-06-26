import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const backendRoot = resolve(scriptDir, '..')
const reportsDir = resolve(backendRoot, '..', 'reports', 'grade-teamluck-metrics')
const jsonPath = resolve(reportsDir, 'metrics-summary.json')
const textPath = resolve(reportsDir, 'metrics-summary.txt')

function round(value, digits = 6) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return value
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

async function importDist(relativePath) {
  return import(pathToFileURL(resolve(backendRoot, 'dist', relativePath)).href)
}

async function readJson(relativePath) {
  const raw = await readFile(resolve(backendRoot, relativePath), 'utf8')
  return JSON.parse(raw)
}

function metricDisplayName(definition) {
  const names = {
    damageToPlayer: '피해량',
    playerKill: '킬',
    teamKill: '팀 킬 관여',
    playerAssistant: '어시스트',
    survival: '생존/데스',
    viewContribution: '시야',
    monsterKill: '야생동물',
    winRate: '승률',
    top3Rate: 'Top3',
    averagePlace: '평균 순위',
  }
  return names[definition.key] ?? definition.key
}

function directionLabel(higherBetter) {
  return higherBetter ? '높을수록 좋음' : '낮을수록 좋음'
}

function sortedObjectEntries(object) {
  return Object.entries(object).sort(([a], [b]) => a.localeCompare(b, 'ko-KR'))
}

function roleWeightSummary(rolePresetWeights, sumRoleWeights) {
  return sortedObjectEntries(rolePresetWeights).map(([role, weights]) => {
    const weightSum = sumRoleWeights(role)
    return {
      role,
      weights,
      weightSum,
      expectedWeightSum: 100,
      status: weightSum === 100 ? 'ok' : 'mismatch',
    }
  })
}

function roleMetricTable(rolePresetWeights, roleMetricDefinitions) {
  const rows = []
  for (const [role, weights] of sortedObjectEntries(rolePresetWeights)) {
    for (const definition of roleMetricDefinitions) {
      rows.push({
        role,
        metric: metricDisplayName(definition),
        metricKey: definition.key,
        presetKey: definition.weightKey,
        baselineMetric: definition.tierOnlyKey,
        weight: weights[definition.weightKey],
        direction: directionLabel(definition.higherBetter),
        normalization: `${definition.tierOnlyKey} 기준선 대비`,
        matchGradeImpact: 'roleScore를 통해 간접 반영',
        teamLuckImpact: 'roleScore residual을 통해 간접 반영',
      })
    }
  }
  return rows
}

function outcomeMetricTable(outcomeMetricDefinitions) {
  return outcomeMetricDefinitions.map((definition) => ({
    metric: metricDisplayName(definition),
    metricKey: definition.key,
    baselineMetric: definition.tierOnlyKey,
    weight: definition.weight,
    direction: directionLabel(definition.higherBetter),
    normalization: `${definition.tierOnlyKey} 기준선 대비`,
  }))
}

function compactFineCuts(cuts) {
  return cuts.map((cut) => ({
    grade: cut.grade,
    min: Number.isFinite(cut.min) ? cut.min : '-Infinity',
  }))
}

function weatherThresholdRows(thresholds) {
  return [
    { condition: `>= p90 (${thresholds.p90})`, label: '최상' },
    { condition: `>= p70 (${thresholds.p70})`, label: '좋음' },
    { condition: `> p30 (${thresholds.p30})`, label: '보통' },
    { condition: `> p10 (${thresholds.p10})`, label: '나쁨' },
    { condition: `<= p10 (${thresholds.p10})`, label: '최악' },
  ]
}

function markdownTable(headers, rows) {
  const header = `| ${headers.join(' | ')} |`
  const divider = `| ${headers.map(() => '---').join(' | ')} |`
  const body = rows.map((row) => `| ${headers.map((headerName) => String(row[headerName] ?? '')).join(' | ')} |`)
  return [header, divider, ...body].join('\n')
}

function buildTextReport(summary) {
  const roleRows = summary.roleMetricTable.map((row) => ({
    역할: row.role,
    지표: row.metric,
    가중치: row.weight,
    방향: row.direction,
    정규화: row.normalization,
    '경기 등급 영향': row.matchGradeImpact,
    '팀운 영향': row.teamLuckImpact,
  }))
  const outcomeRows = summary.matchGrade.outcomeMetrics.map((row) => ({
    지표: row.metric,
    가중치: row.weight,
    방향: row.direction,
    정규화: row.normalization,
  }))
  const placementRows = Object.entries(summary.matchGrade.percentileCalibration.placementModifier)
    .map(([placement, modifier]) => ({ 순위: placement, 보정: modifier }))
  const weatherRows = summary.teamLuck.weatherThresholds.table.map((row) => ({
    조건: row.condition,
    단계: row.label,
  }))
  const roleSumRows = summary.roleWeightSums.map((row) => ({
    역할: row.role,
    합계: row.weightSum,
    기대값: row.expectedWeightSum,
    상태: row.status,
  }))

  return [
    '# Grade / Team Luck Metrics Summary',
    '',
    summary.globalMetricRatioNote,
    '',
    '## 경기 등급',
    `- match grade version: ${summary.matchGrade.version}`,
    `- percentile calibration version: ${summary.matchGrade.percentileCalibration.version}`,
    `- residual baseline version: ${summary.matchGrade.percentileCalibration.residualBaselineVersion}`,
    `- P4 flow: ${summary.matchGrade.p4Flow.join(' -> ')}`,
    `- roleResidual: ${summary.matchGrade.roleResidualFormula}`,
    `- final score: ${summary.matchGrade.percentileCalibration.finalScoreFormula}`,
    `- S gate percentiles: S-family ${summary.matchGrade.percentileCalibration.gates.sFamily}, S ${summary.matchGrade.percentileCalibration.gates.s}, S+ ${summary.matchGrade.percentileCalibration.gates.sPlus}`,
    '',
    '### placement modifier',
    markdownTable(['순위', '보정'], placementRows),
    '',
    '### scoreToFineGrade',
    markdownTable(['grade', 'min'], summary.matchGrade.fineGradeCuts),
    '',
    '### outcome metrics',
    markdownTable(['지표', '가중치', '방향', '정규화'], outcomeRows),
    '',
    '## 팀운',
    `- team metric version: ${summary.teamLuck.teamMetricVersion}`,
    `- residual baseline version: ${summary.teamLuck.residualBaselineVersion}`,
    `- benchmark version: ${summary.teamLuck.benchmarkVersion}`,
    `- personal residual: ${summary.teamLuck.personalResidualFormula}`,
    `- team luck residual: ${summary.teamLuck.teamLuckResidualFormula}`,
    `- carry burden residual: ${summary.teamLuck.carryBurdenResidualFormula}`,
    `- DB cache versions: ${summary.teamLuck.dbCacheVersions.join(', ')}`,
    '',
    '### weather thresholds',
    markdownTable(['조건', '단계'], weatherRows),
    '',
    '### fallback levels',
    ...summary.teamLuck.fallbackLevels.map((row) => `- ${row.level}: ${row.definition}`),
    '',
    '### confidence',
    ...summary.teamLuck.confidenceRules.map((row) => `- ${row.levels}: ${row.confidence}`),
    '',
    '## 역할별 metric',
    markdownTable(['역할', '지표', '가중치', '방향', '정규화', '경기 등급 영향', '팀운 영향'], roleRows),
    '',
    '## 역할별 가중치 합계',
    markdownTable(['역할', '합계', '기대값', '상태'], roleSumRows),
    '',
    '## warnings',
    ...(summary.warnings.length > 0 ? summary.warnings.map((warning) => `- ${warning}`) : ['- none']),
    '',
  ].join('\n')
}

async function main() {
  const [
    config,
    metrics,
    compute,
    teamPerformance,
    teamLuckBaseline,
    percentileCalibration,
    residualBaseline,
  ] = await Promise.all([
    importDist('services/characterPerformanceGrade/config.js'),
    importDist('services/characterPerformanceGrade/metrics.js'),
    importDist('services/characterPerformanceGrade/compute.js'),
    importDist('services/teamPerformance.js'),
    importDist('services/teamLuckResidualBaseline.js'),
    readJson('src/data/matchGradePercentileCalibration/match-grade-percentile-calibration.v2.json'),
    readJson('src/data/teamLuckResidual/team-luck-residual-baselines.v3.json'),
  ])

  const roleSums = roleWeightSummary(config.ROLE_PRESET_WEIGHTS, config.sumRoleWeights)
  const warnings = []
  for (const row of roleSums) {
    if (row.status !== 'ok') {
      warnings.push(`${row.role} role weight sum is ${row.weightSum}, expected ${row.expectedWeightSum}`)
    }
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    globalMetricRatioNote:
      '경기 등급과 팀운에는 전역 고정 metric 비율이 없으며, 역할별 metric preset으로 계산된 roleScore를 기반으로 한다.',
    matchGrade: {
      version: compute.MATCH_GRADE_VERSION,
      benchmarkVersion: config.CHARACTER_GRADE_BENCHMARK_VERSION,
      metricPresetVersion: config.CHARACTER_GRADE_METRIC_PRESET_VERSION,
      p4Flow: [
        'compute legacy roleScore/outcomeScore',
        'resolve residual expected roleScore from team-luck residual baseline',
        'roleResidual -> empirical percentile',
        'P4 target quantile curve maps percentile to base score',
        'apply placement modifier',
        'apply percentile S gates',
        'scoreToFineGrade',
      ],
      roleResidualFormula: 'actual matchGradeRoleScore - expected rolePerformanceScore for same season/mode/tier/character/weapon/role/placement bucket/duration bucket',
      directFields: metrics.ROLE_METRIC_DEFINITIONS.map((definition) => ({
        metric: definition.key,
        baselineMetric: definition.tierOnlyKey,
        direction: directionLabel(definition.higherBetter),
      })),
      roleScoreMetrics: metrics.ROLE_METRIC_DEFINITIONS.map((definition) => ({
        metric: definition.key,
        presetKey: definition.weightKey,
        baselineMetric: definition.tierOnlyKey,
        direction: directionLabel(definition.higherBetter),
      })),
      outcomeWeights: {
        roleScore: config.ROLE_SCORE_WEIGHT,
        outcomeScore: config.OUTCOME_SCORE_WEIGHT,
      },
      outcomeMetrics: outcomeMetricTable(metrics.OUTCOME_METRIC_DEFINITIONS),
      sLegacyGates: {
        roleScoreGate: config.MATCH_GRADE_S_ROLE_SCORE_GATE,
        sPlusRoleScoreGate: config.MATCH_GRADE_S_PLUS_ROLE_SCORE_GATE,
        sPlusOutcomeScoreGate: config.MATCH_GRADE_S_PLUS_OUTCOME_SCORE_GATE,
      },
      fineGradeCuts: compactFineCuts(config.FINE_GRADE_CUTS),
      percentileCalibration: {
        version: percentileCalibration.calibrationVersion,
        residualBaselineVersion: percentileCalibration.residualBaselineVersion,
        finalScoreFormula: 'targetQuantileCurve(residual percentile) + placementModifier, clamped 0..100, then gated by residual percentiles',
        placementModifier: percentileCalibration.placementAdjustment,
        gates: percentileCalibration.gates,
        gateResidualCutoffs: percentileCalibration.gateResidualCutoffs,
        targetQuantileCurve: percentileCalibration.targetQuantileCurve,
      },
    },
    teamLuck: {
      teamMetricVersion: teamPerformance.TEAM_PERFORMANCE_METRIC_PRESET_VERSION,
      benchmarkVersion: teamPerformance.TEAM_PERFORMANCE_BENCHMARK_VERSION,
      residualBaselineVersion: teamLuckBaseline.TEAM_LUCK_RESIDUAL_BASELINE_VERSION,
      weatherThresholdVersion: residualBaseline.config.weatherThresholdVersion,
      personalResidualFormula: 'actual rolePerformanceScore - expected rolePerformanceScore',
      teamLuckResidualFormula: 'average residual of calculated teammates',
      carryBurdenResidualFormula: 'own residual - teammate residual average',
      weatherThresholds: {
        raw: teamLuckBaseline.TEAM_LUCK_RESIDUAL_WEATHER_THRESHOLDS,
        table: weatherThresholdRows(teamLuckBaseline.TEAM_LUCK_RESIDUAL_WEATHER_THRESHOLDS),
      },
      fallbackLevels: teamLuckBaseline.RESIDUAL_FALLBACK_LEVELS.map((level) => ({
        level,
        definition: residualBaseline.levelDefinitions[level],
      })),
      confidenceRules: [
        { levels: 'L0', confidence: 'high' },
        { levels: 'L1/L2', confidence: 'medium' },
        { levels: 'L3/L4/null', confidence: 'low' },
      ],
      dbCacheVersions: [
        teamPerformance.TEAM_PERFORMANCE_METRIC_PRESET_VERSION,
        teamLuckBaseline.TEAM_LUCK_RESIDUAL_BASELINE_VERSION,
        teamPerformance.TEAM_PERFORMANCE_BENCHMARK_VERSION,
      ],
      minimumSampleCount: residualBaseline.config.minimumSampleCount,
      shrinkageK: residualBaseline.config.shrinkageK,
      residualMetricsAvailable: residualBaseline.metricNames,
    },
    roleMetricTable: roleMetricTable(config.ROLE_PRESET_WEIGHTS, metrics.ROLE_METRIC_DEFINITIONS),
    roleWeightSums: roleSums,
    warnings,
  }

  await mkdir(reportsDir, { recursive: true })
  await writeFile(jsonPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
  await writeFile(textPath, buildTextReport(summary), 'utf8')

  console.log(`Wrote ${jsonPath}`)
  console.log(`Wrote ${textPath}`)
  console.log(`Role weight warnings: ${warnings.length}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
