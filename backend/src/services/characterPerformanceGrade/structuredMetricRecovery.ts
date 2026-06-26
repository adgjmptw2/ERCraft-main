export const STRUCTURED_METRIC_MIN_GAMES = 5
export const STRUCTURED_METRIC_COVERAGE_RATIO = 0.8

export interface StructuredMetricCoverage {
  totalGames: number
  structuredGames: number
  coverageRatio: number
  eligible: boolean
}

export function resolveStructuredMetricCoverage(
  totalGames: number,
  structuredGames: number,
): StructuredMetricCoverage {
  const coverageRatio = totalGames > 0 ? structuredGames / totalGames : 0
  const eligible =
    totalGames >= STRUCTURED_METRIC_MIN_GAMES &&
    structuredGames >= STRUCTURED_METRIC_MIN_GAMES &&
    coverageRatio >= STRUCTURED_METRIC_COVERAGE_RATIO
  return { totalGames, structuredGames, coverageRatio, eligible }
}

export function readStructuredNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function readStructuredMetricFromRow(
  row: {
    roleMetricsVersion: number | null
    viewContribution?: number | null
    monsterKill?: number | null
    rawJson?: unknown
  },
  field: 'viewContribution' | 'monsterKill',
): { value: number | null; fromStructured: boolean } {
  if (row.roleMetricsVersion === 1) {
    const columnValue = readStructuredNumber(row[field])
    if (columnValue != null) {
      return { value: columnValue, fromStructured: true }
    }
  }

  if (typeof row.rawJson === 'object' && row.rawJson !== null) {
    const record = row.rawJson as Record<string, unknown>
    const rawValue = readStructuredNumber(record[field])
    if (rawValue != null) {
      return { value: rawValue, fromStructured: false }
    }
  }

  return { value: null, fromStructured: false }
}
