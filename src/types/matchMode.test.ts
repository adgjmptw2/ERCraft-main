import { describe, expect, it } from 'vitest'

import {
  MATCH_HISTORY_MODE_EMPTY_MESSAGE,
  matchHistoryEmptyMessage,
  matchHistoryFilteredEmptyMessage,
} from '@/types/matchMode'

describe('matchHistoryFilteredEmptyMessage', () => {
  it('union mode → DB-first empty 안내', () => {
    expect(matchHistoryFilteredEmptyMessage('union')).toBe(MATCH_HISTORY_MODE_EMPTY_MESSAGE)
    expect(matchHistoryEmptyMessage('union')).toBe(MATCH_HISTORY_MODE_EMPTY_MESSAGE)
  })

  it('rank/normal/cobalt → mode DB empty 안내', () => {
    expect(matchHistoryFilteredEmptyMessage('rank')).toBe(MATCH_HISTORY_MODE_EMPTY_MESSAGE)
    expect(matchHistoryFilteredEmptyMessage('normal')).toBe(MATCH_HISTORY_MODE_EMPTY_MESSAGE)
    expect(matchHistoryFilteredEmptyMessage('cobalt')).toBe(MATCH_HISTORY_MODE_EMPTY_MESSAGE)
  })

  it('all → null', () => {
    expect(matchHistoryFilteredEmptyMessage('all')).toBeNull()
    expect(matchHistoryEmptyMessage('all')).toBeNull()
  })
})
