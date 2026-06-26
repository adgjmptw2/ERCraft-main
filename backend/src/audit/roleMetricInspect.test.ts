import { describe, expect, it } from 'vitest'

import { formatComboDisplayName } from '../utils/comboDisplayName.js'
import {
  TANK_TARGETS,
  buildFieldInventory,
  buildRedactedSamples,
  buildTextReport,
  collectPathValues,
  formatPath,
  parseRawJson,
  pathMatchesKeyword,
  redactSensitive,
} from './roleMetricInspect.js'

describe('roleMetricInspectCore', () => {
  it('nested object 재귀 탐색', () => {
    const paths = collectPathValues({
      damageFromPlayer: 1200,
      nested: { allyHealAmount: 340 },
    })
    expect(paths.has('damageFromPlayer')).toBe(true)
    expect(paths.has('nested.allyHealAmount')).toBe(true)
  })

  it('배열 내부 공통 path 처리', () => {
    const paths = collectPathValues({
      teamMembers: [{ healAmount: 5 }, { healAmount: 9 }],
    })
    expect(paths.has('teamMembers[].healAmount')).toBe(true)
    expect(paths.get('teamMembers[].healAmount')).toEqual([5, 9])
  })

  it('null/string/boolean/number 타입 구분', () => {
    const inventory = buildFieldInventory([
      {
        rawJson: {
          healFlag: true,
          healNote: 'x',
          healNull: null,
          healAmount: 42,
        },
        characterNum: 30,
        bestWeapon: 13,
        roleBucket: 'tank',
      },
    ])

    const byPath = new Map(inventory.fields.map((field) => [field.path, field]))
    expect(byPath.get('healFlag')?.observedTypes).toContain('boolean')
    expect(byPath.get('healNote')?.observedTypes).toContain('string')
    expect(byPath.get('healNull')?.observedTypes).toContain('null')
    expect(byPath.get('healAmount')?.observedTypes).toContain('number')
  })

  it('숫자 필드 min/max/avg 계산', () => {
    const inventory = buildFieldInventory([
      {
        rawJson: { viewContribution: 10 },
        characterNum: 30,
        bestWeapon: 13,
        roleBucket: 'tank',
      },
      {
        rawJson: { viewContribution: 30 },
        characterNum: 73,
        bestWeapon: 24,
        roleBucket: 'support',
      },
    ])

    const field = inventory.fields.find((entry) => entry.path === 'viewContribution')
    expect(field?.min).toBe(10)
    expect(field?.max).toBe(30)
    expect(field?.average).toBe(20)
  })

  it('0이 아닌 값 비율', () => {
    const inventory = buildFieldInventory([
      {
        rawJson: { shieldGiven: 0 },
        characterNum: 30,
        bestWeapon: 13,
        roleBucket: 'tank',
      },
      {
        rawJson: { shieldGiven: 15 },
        characterNum: 30,
        bestWeapon: 13,
        roleBucket: 'tank',
      },
    ])

    const field = inventory.fields.find((entry) => entry.path === 'shieldGiven')
    expect(field?.nonZeroRatio).toBe(0.5)
  })

  it('개인정보 출력 방지', () => {
    const redacted = redactSensitive({
      nickname: 'secret',
      userNum: 123,
      uid: 'abc',
      viewContribution: 50,
    })
    expect(redacted).toEqual({
      nickname: '[redacted]',
      userNum: '[redacted]',
      uid: '[redacted]',
      viewContribution: 50,
    })
  })

  it('rawJson 손상 행 skip', () => {
    const inventory = buildFieldInventory([
      {
        rawJson: '{not-json',
        characterNum: 30,
        bestWeapon: 13,
        roleBucket: 'tank',
      },
      {
        rawJson: { viewContribution: 12 },
        characterNum: 30,
        bestWeapon: 13,
        roleBucket: 'tank',
      },
    ])
    expect(inventory.investigatedMatchCount).toBe(2)
    expect(inventory.fields.some((field) => field.path === 'viewContribution')).toBe(true)
  })

  it('rawJson string/object 양쪽 지원', () => {
    const fromString = buildFieldInventory([
      {
        rawJson: JSON.stringify({ damageFromPlayer: 900 }),
        characterNum: 30,
        bestWeapon: 13,
        roleBucket: 'tank',
      },
    ])
    const fromObject = buildFieldInventory([
      {
        rawJson: { damageFromPlayer: 900 },
        characterNum: 30,
        bestWeapon: 13,
        roleBucket: 'tank',
      },
    ])
    expect(fromString.fields.some((field) => field.path === 'damageFromPlayer')).toBe(true)
    expect(fromObject.fields.some((field) => field.path === 'damageFromPlayer')).toBe(true)
  })

  it('DB가 비어 있어도 명확한 보고서 생성', () => {
    const inventory = buildFieldInventory([])
    const report = buildTextReport({
      investigatedMatchCount: 0,
      sampleCounts: Object.fromEntries(
        TANK_TARGETS.map((target) => [
          `${formatComboDisplayName(target.characterNum, target.weaponTypeId)} (${target.characterNum}:${target.weaponTypeId})`,
          0,
        ]),
      ),
      excludedCombos: [],
      inventory,
    })
    expect(report).toContain('조사한 PlayerMatch 수')
    expect(report).toContain('total: 0')
    expect(report).toContain('다음 단계 권장안')
  })

  it('formatPath와 keyword matcher', () => {
    expect(formatPath(['teamMembers', '[]', 'healAmount'])).toBe('teamMembers[].healAmount')
    expect(pathMatchesKeyword('damageFromPlayer')).toBe(true)
    expect(pathMatchesKeyword('playerKill')).toBe(false)
  })

  it('redacted samples에 rawJson 원문 PII 미포함', () => {
    const samples = buildRedactedSamples([
      {
        rawJson: { nickname: 'hidden', viewContribution: 10 },
        characterNum: 30,
        bestWeapon: 13,
        roleBucket: 'tank',
      },
    ])
    expect(JSON.stringify(samples)).not.toContain('hidden')
    expect(samples[0]?.rawJson).toMatchObject({ nickname: '[redacted]', viewContribution: 10 })
  })
})
