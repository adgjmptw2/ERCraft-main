import { describe, expect, it } from 'vitest'

import {
  CaptureAliasRegistry,
  buildCaptureFieldInventory,
  buildCaptureTargets,
  dedupePlannedSamples,
  parseCaptureCliArgs,
  pickParticipantRow,
  redactCaptureRecord,
} from './roleMetricCapture.js'
import { collectPathValues } from './roleMetricInspect.js'

describe('roleMetricCapture', () => {
  it('39.11B 재귀 탐색기 재사용', () => {
    const paths = collectPathValues({ damageFromPlayer: 1200, nested: { healAmount: 5 } })
    expect(paths.has('damageFromPlayer')).toBe(true)
    expect(paths.has('nested.healAmount')).toBe(true)
  })

  it('배열 경로 정규화', () => {
    const paths = collectPathValues({ teamMembers: [{ healAmount: 3 }] })
    expect(paths.has('teamMembers[].healAmount')).toBe(true)
  })

  it('PII 마스킹 및 gameId/userNum 가명화', () => {
    const registry = new CaptureAliasRegistry()
    const redacted = redactCaptureRecord(
      {
        gameId: 123456789,
        userNum: 98765,
        nickname: 'secret',
        damageFromPlayer: 5000,
      },
      registry,
    ) as Record<string, unknown>

    expect(redacted.nickname).toBe('[redacted]')
    expect(redacted.gameId).toBe('SAMPLE_GAME_001')
    expect(redacted.userNum).toBe('SAMPLE_USER_001')
    expect(JSON.stringify(redacted)).not.toContain('secret')
    expect(JSON.stringify(redacted)).not.toContain('98765')
  })

  it('동일 API 응답 내 대상 사용자 선택', () => {
    const row = pickParticipantRow(
      [
        { characterNum: 73, bestWeapon: 24, userNum: 1, uid: 'uid-a' },
        { characterNum: 73, bestWeapon: 24, userNum: 2, uid: 'uid-b' },
      ],
      { characterNum: 73, weaponTypeId: 24, uid: 'uid-b' },
    )
    expect(row?.userNum).toBe(2)
  })

  it('숫자 필드 min/max/average 및 role 그룹 비교', () => {
    const inventory = buildCaptureFieldInventory([
      {
        sampleGameAlias: 'SAMPLE_GAME_001',
        sampleUserAlias: 'SAMPLE_USER_001',
        characterNum: 30,
        weaponTypeId: 13,
        roleGroup: 'tanker',
        comboLabel: 'tank',
        payload: { damageFromPlayer: 9000, viewContribution: 10 },
      },
      {
        sampleGameAlias: 'SAMPLE_GAME_002',
        sampleUserAlias: 'SAMPLE_USER_002',
        characterNum: 73,
        weaponTypeId: 24,
        roleGroup: 'supporter',
        comboLabel: 'support',
        payload: { damageFromPlayer: 3000, viewContribution: 20 },
      },
    ])

    const damageField = inventory.find((field) => field.path === 'damageFromPlayer')
    expect(damageField?.min).toBe(3000)
    expect(damageField?.max).toBe(9000)
    expect(damageField?.average).toBe(6000)
    expect(damageField?.roles.tanker?.average).toBe(9000)
    expect(damageField?.roles.supporter?.average).toBe(3000)
  })

  it('중복 경기 제거 및 max games cap', () => {
    const { selected, skipped } = dedupePlannedSamples(
      [
        {
          label: 'a',
          characterNum: 1,
          weaponTypeId: 1,
          roleGroup: 'tanker',
          gameId: '100',
          uid: 'u1',
        },
        {
          label: 'b',
          characterNum: 2,
          weaponTypeId: 2,
          roleGroup: 'supporter',
          gameId: '100',
          uid: 'u2',
        },
        {
          label: 'c',
          characterNum: 3,
          weaponTypeId: 3,
          roleGroup: 'dealer',
          gameId: '200',
          uid: 'u3',
        },
      ],
      1,
    )
    expect(selected).toHaveLength(2)
    expect(skipped).toHaveLength(1)
  })

  it('dry-run CLI 옵션 파싱', () => {
    expect(parseCaptureCliArgs(['--dry-run', '--max-per-combination=3'])).toMatchObject({
      dryRun: true,
      maxPerCombination: 3,
    })
  })

  it('capture target 목록에 탱커·서포터·비교군 포함', () => {
    const targets = buildCaptureTargets()
    expect(targets.filter((t) => t.roleGroup === 'tanker').length).toBe(6)
    expect(targets.filter((t) => t.roleGroup === 'supporter').length).toBe(6)
    expect(targets.filter((t) => t.roleGroup === 'dealer').length).toBeGreaterThanOrEqual(4)
    expect(targets.filter((t) => t.roleGroup === 'bruiser').length).toBeGreaterThanOrEqual(2)
  })
})
