import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(process.cwd(), 'src', 'components')

function walkTsFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules') continue
      out.push(...walkTsFiles(full))
    } else if (/\.(tsx?)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full)
    }
  }
  return out
}

const UTILS = join(process.cwd(), 'src', 'utils')

describe('asset preload guard', () => {
  it('UI 코드가 manifest.json을 fetch/preload하지 않는다', () => {
    const offenders: string[] = []
    for (const file of walkTsFiles(SRC)) {
      const text = readFileSync(file, 'utf8')
      if (text.includes('manifest.json') && (text.includes('fetch') || text.includes('preload'))) {
        offenders.push(file)
      }
    }
    for (const file of walkTsFiles(UTILS)) {
      const text = readFileSync(file, 'utf8')
      if (text.includes('manifest.json') && (text.includes('fetch') || text.includes('preload'))) {
        offenders.push(file)
      }
    }
    expect(offenders).toEqual([])
  })

  it('UI가 items/loadout manifest 배열을 일괄 map 렌더하지 않는다', () => {
    const bulkPattern = /manifest\.items\.map|manifest\.loadout\.map|VERIFIED_ITEM_SLUGS.*\.map\([^)]*ItemIcon/
    const offenders: string[] = []
    for (const file of walkTsFiles(SRC)) {
      const text = readFileSync(file, 'utf8')
      if (bulkPattern.test(text)) offenders.push(file)
    }
    expect(offenders).toEqual([])
  })
})
