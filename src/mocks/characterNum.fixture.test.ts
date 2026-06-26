import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import type { MatchSummary } from '@/types/match'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const matches = (JSON.parse(readFileSync(join(ROOT, 'mocks/matches.json'), 'utf8')) as {
  matches: MatchSummary[]
}).matches

/** mock matches.json에 등장하는 캐릭터의 Open API characterNum */
const EXPECTED: Record<string, number> = {
  Yuki: 11,
  Hyunwoo: 7,
  Adela: 24,
  'Li Dailin': 10,
  Chiara: 14,
  Sissela: 15,
}

describe('mock matches characterNum', () => {
  it('검증 대상 캐릭터는 characterNum이 유지된다', () => {
    for (const [name, num] of Object.entries(EXPECTED)) {
      const row = matches.find((m) => m.characterName === name && m.characterNum != null)
      expect(row, `${name} 매치에 characterNum 필요`).toBeDefined()
      expect(row?.characterNum).toBe(num)
    }
  })

  it('모든 mock 매치에 characterNum이 있으면 양수 정수', () => {
    for (const m of matches) {
      if (m.characterNum == null) continue
      expect(Number.isInteger(m.characterNum)).toBe(true)
      expect(m.characterNum).toBeGreaterThan(0)
    }
  })
})
