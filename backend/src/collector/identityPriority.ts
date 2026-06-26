import type { CollectorIdentityQueue } from '@prisma/client'

export interface IdentityPriorityContext {
  nicknameOccurrenceCount: number
  sourcePlayedAtMs: number | null
  hasBindingHint: boolean
  teamLuckResolvable: boolean
  sampleSparseBonus: number
}

export interface IdentityPriorityInput {
  row: Pick<
    CollectorIdentityQueue,
    'nickname' | 'sourceGameId' | 'characterNum' | 'priority' | 'attemptCount'
  >
  context: IdentityPriorityContext
}

/** Lower number = higher priority (claim order asc). Range roughly 1..99. */
export function computeIdentityPriority(input: IdentityPriorityInput): number {
  let score = 60

  if (input.context.hasBindingHint) {
    score -= 35
  }

  if (input.context.nicknameOccurrenceCount >= 2) {
    score -= Math.min(15, input.context.nicknameOccurrenceCount * 3)
  }

  if (input.context.teamLuckResolvable) {
    score -= 8
  }

  if (input.context.sampleSparseBonus > 0) {
    score -= Math.min(12, input.context.sampleSparseBonus)
  }

  if (input.context.sourcePlayedAtMs != null) {
    const ageDays = Math.max(0, (Date.now() - input.context.sourcePlayedAtMs) / (24 * 60 * 60 * 1000))
    if (ageDays <= 7) score -= 10
    else if (ageDays <= 30) score -= 5
    else if (ageDays > 180) score += 12
    else if (ageDays > 90) score += 6
  } else {
    score += 4
  }

  if (input.context.nicknameOccurrenceCount >= 4) {
    score += 6
  }

  score += Math.min(10, input.row.attemptCount * 2)

  return Math.max(1, Math.min(99, Math.round(score)))
}

export function qualifiesForDeepVerification(
  priority: number,
  threshold: number,
  deepEnabled: boolean,
): boolean {
  if (!deepEnabled) return false
  return priority <= threshold
}
