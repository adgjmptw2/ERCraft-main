export interface BenchmarkTierStatus {
  tierKey: string
  label: string
  games: number
  combinations: number
}

export interface BenchmarkStatus {
  aggregateGradeVersion?: string
  characterAggregateGradeVersion?: string
  overallAggregateGradeVersion?: string
  aggregateGradeCutVersion?: string
  aggregateShrinkVersion?: string
  aggregateShrinkK?: number
  placementAdjustmentVersion?: string
  supportedModes: string[]
  unsupportedModes: string[]
  collectedGames: {
    total: number
    byTier: BenchmarkTierStatus[]
  }
  localCollectedGames?: {
    source: 'playerMatch'
    total: number
    byTier: BenchmarkTierStatus[]
    byRole: Array<{
      role: string
      games: number
    }>
    generatedAt: string
    recentMatchesLastHour?: number
    matchesPerMinute?: number | null
    collectionWindowMinutes?: number
    note: string
  }
  live: {
    mode: 'standard' | 'validation' | 'fallback'
    roleMetrics: 'stable' | 'validation'
    combatMetrics: 'stable' | 'validation'
    snapshot: 'ready' | 'fallback'
    message: string
  }
}
