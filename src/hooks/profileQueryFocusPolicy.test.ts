import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const PROFILE_QUERY_HOOKS = [
  'src/hooks/usePlayerSummary.ts',
  'src/hooks/usePlayerStatsDTO.ts',
  'src/hooks/usePlayerSeasons.ts',
  'src/hooks/useMatchDTOHistory.ts',
] as const

describe('39.10I profile query focus policy', () => {
  it.each(PROFILE_QUERY_HOOKS)('%s disables refetchOnWindowFocus', (relativePath) => {
    const source = readFileSync(join(process.cwd(), relativePath), 'utf8')
    expect(source).toMatch(/refetchOnWindowFocus:\s*false/)
  })
})
