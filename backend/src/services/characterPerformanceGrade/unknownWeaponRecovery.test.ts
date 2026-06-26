import { describe, expect, it } from 'vitest'

import {
  readBestWeaponFromDetailRaw,
  resolveWeaponRecoveryForRow,
} from './unknownWeaponRecovery.js'
import { classifyBestWeaponValue } from './unknownRoleReason.js'

describe('unknownWeaponRecovery', () => {
  it('classifies null and zero bestWeapon as missing/invalid', () => {
    expect(classifyBestWeaponValue(null)).toBe('missing')
    expect(classifyBestWeaponValue(0)).toBe('invalid')
    expect(classifyBestWeaponValue(9)).toBe('valid')
  })

  it('recovers from match participant without overwriting valid rows', () => {
    const recovery = resolveWeaponRecoveryForRow({
      row: {
        id: 1n,
        uid: 'u1',
        gameId: 'g1',
        gameMode: 'rank',
        characterNum: 27,
        bestWeapon: null,
        rawJson: null,
        createdAt: new Date(),
      },
      participantBestWeapon: 9,
      detailRawJson: null,
    })
    expect(recovery?.source).toBe('match-participant')
    expect(recovery?.recoveredBestWeapon).toBe(9)

    const skip = resolveWeaponRecoveryForRow({
      row: {
        id: 2n,
        uid: 'u1',
        gameId: 'g2',
        gameMode: 'rank',
        characterNum: 27,
        bestWeapon: 2,
        rawJson: null,
        createdAt: new Date(),
      },
      participantBestWeapon: 9,
      detailRawJson: null,
    })
    expect(skip).toBeNull()
  })

  it('rejects ambiguous raw detail matches', () => {
    const detail = readBestWeaponFromDetailRaw(
      [
        { uid: 'u1', characterNum: 27, bestWeapon: 9 },
        { uid: 'u1', characterNum: 27, bestWeapon: 16 },
      ],
      'u1',
      27,
    )
    expect(detail.ambiguous).toBe(true)
    expect(detail.weapon).toBeNull()
  })
})
