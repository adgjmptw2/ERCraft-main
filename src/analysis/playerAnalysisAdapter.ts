import type { PlayerAnalysisResponseDTO, PlayerAnalysisScopeRowDTO } from '@/types/playerAnalysis'
import type { AnalysisCharacterRow, AnalysisMetricCardModel } from '@/analysis/analysisTabViewModel'

export type AnalysisListSelection = 'overall' | 'recent20' | `character:${number}`

const TOP_CHARACTER_LIMIT = 3

function formatPlayerConfidence(
  confidence: PlayerAnalysisScopeRowDTO['confidence'],
): string {
  switch (confidence) {
    case 'official':
      return '\uC815\uC2DD \uD45C\uBCF8'
    case 'provisional':
      return '\uC7A0\uC815 \uD45C\uBCF8'
    case 'exploratory':
      return '\uD0D0\uC0C9\uC801 \uD45C\uBCF8'
    default:
      return '\uD45C\uBCF8 \uBD80\uC871'
  }
}

function resolveDisplayGrade(row: PlayerAnalysisScopeRowDTO): string | null {
  return row.gradeDisplay ?? row.grade
}

function sortCharacterRows(rows: PlayerAnalysisScopeRowDTO[]): PlayerAnalysisScopeRowDTO[] {
  return [...rows].sort((a, b) => {
    if (b.games !== a.games) return b.games - a.games
    const aTime = a.lastPlayedAt ? Date.parse(a.lastPlayedAt) : 0
    const bTime = b.lastPlayedAt ? Date.parse(b.lastPlayedAt) : 0
    if (bTime !== aTime) return bTime - aTime
    return (a.characterNum ?? 0) - (b.characterNum ?? 0)
  })
}

export function buildAnalysisListRows(
  response: PlayerAnalysisResponseDTO,
): Array<{
  key: AnalysisListSelection
  label: string
  subtitle: string
  games: number
  winRate: string
  avgPlacement: string
  grade: string | null
  characterNum?: number
}> {
  const overall = response.rows.find((row) => row.type === 'overall')
  const recent = response.rows.find((row) => row.type === 'recent20')
  const characters = sortCharacterRows(response.rows.filter((row) => row.type === 'character')).slice(
    0,
    TOP_CHARACTER_LIMIT,
  )

  const formatRate = (value: number | null) =>
    value == null ? '\u2014' : `${value.toFixed(1)}%`
  const formatPlacement = (value: number | null) =>
    value == null ? '\u2014' : `#${value.toFixed(1)}`

  const rows: Array<{
    key: AnalysisListSelection
    label: string
    subtitle: string
    games: number
    winRate: string
    avgPlacement: string
    grade: string | null
    characterNum?: number
  }> = []

  if (overall) {
    rows.push({
      key: 'overall',
      label: '\uC804\uCCB4',
      subtitle: `${overall.games}\uB7AD\uD06C \u00B7 ${formatPlayerConfidence(overall.confidence)}`,
      games: overall.games,
      winRate: formatRate(overall.winRate),
      avgPlacement: formatPlacement(overall.averagePlacement),
      grade: resolveDisplayGrade(overall),
    })
  }
  if (recent) {
    rows.push({
      key: 'recent20',
      label: '\uCD5C\uADFC 20\uACBD\uAE30',
      subtitle: `${recent.games}\uB7AD\uD06C \u00B7 ${formatPlayerConfidence(recent.confidence)}`,
      games: recent.games,
      winRate: formatRate(recent.winRate),
      avgPlacement: formatPlacement(recent.averagePlacement),
      grade: resolveDisplayGrade(recent),
    })
  }
  for (const row of characters) {
    if (row.characterNum == null) continue
    rows.push({
      key: `character:${row.characterNum}`,
      label: row.characterName ?? row.label,
      subtitle: `${row.primaryRole ?? '\uC2E4\uD5D8\uCCB4'} \u00B7 \uB7AD\uD06C ${row.games}\uACBD\uAE30`,
      games: row.games,
      winRate: formatRate(row.winRate),
      avgPlacement: formatPlacement(row.averagePlacement),
      grade: resolveDisplayGrade(row),
      characterNum: row.characterNum,
    })
  }
  return rows
}

export function selectAnalysisRow(
  response: PlayerAnalysisResponseDTO,
  selection: AnalysisListSelection,
): PlayerAnalysisScopeRowDTO | null {
  if (selection === 'overall') return response.rows.find((row) => row.type === 'overall') ?? null
  if (selection === 'recent20') return response.rows.find((row) => row.type === 'recent20') ?? null
  if (typeof selection === 'string' && selection.startsWith('character:')) {
    const num = Number(selection.slice('character:'.length))
    return response.rows.find((row) => row.type === 'character' && row.characterNum === num) ?? null
  }
  return response.rows.find((row) => row.type === 'overall') ?? null
}

export function mapAnalysisMetricsToCards(
  row: PlayerAnalysisScopeRowDTO,
): AnalysisMetricCardModel[] {
  return row.metrics.map((metric) => ({
    id: metric.key,
    label: metric.label,
    value: metric.displayValue,
    hint:
      metric.samplePlayers != null && metric.samplePlayers > 0
        ? `${metric.comparisonLabel} \u00B7 ${metric.percentileDisplay ?? metric.percentileLabel} \u00B7 ${metric.samplePlayers}\uBA85`
        : metric.percentileDisplay ?? metric.percentileLabel,
    size: metric.key === 'overallScore' ? 'featured' : 'medium',
    unavailable: metric.unavailable === true,
    status: metric.unavailable ? 'unavailable' : 'ready',
    isSecondary: false,
  }))
}

export function mapCharacterRowsForLegacy(
  response: PlayerAnalysisResponseDTO,
): AnalysisCharacterRow[] {
  return sortCharacterRows(response.rows.filter((row) => row.type === 'character'))
    .slice(0, TOP_CHARACTER_LIMIT)
    .map((row) => ({
      id: row.characterName ?? String(row.characterNum),
      name: row.characterName ?? row.label,
      characterNum: row.characterNum,
      games: row.games,
      winRate: row.winRate == null ? '\u2014' : `${row.winRate.toFixed(1)}%`,
      avgPlacement: row.averagePlacement == null ? '\u2014' : row.averagePlacement.toFixed(1),
      featured: row.isTopCharacter === true,
    }))
}

export function buildAnalysisSummaryLine(row: PlayerAnalysisScopeRowDTO): string {
  const grade = resolveDisplayGrade(row)
  const band = grade ?? row.percentileDisplay ?? '\uBE44\uAD50 \uD45C\uBCF8 \uBD80\uC871'
  return `${row.comparison.displayLabel} \u00B7 ${row.comparison.samplePlayers}\uBA85 \u00B7 ${band}`
}