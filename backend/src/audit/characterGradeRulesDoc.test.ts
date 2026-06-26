import { describe, expect, it } from 'vitest'

import {
  assertCharacterGradeRulesMatchConfig,
  buildCharacterGradeRulesDocument,
} from './characterGradeRulesDoc.js'
import { ROLE_PRESET_WEIGHTS } from '../services/characterPerformanceGrade/config.js'
import { resolveSupportSubtype } from '../services/characterPerformanceGrade/supportSubtype.js'

describe('characterGradeRulesDoc', () => {
  it('generates 113 canonical combinations matching config', () => {
    const document = buildCharacterGradeRulesDocument()
    assertCharacterGradeRulesMatchConfig(document)
    expect(document.canonicalCombinationCount).toBe(113)
    expect(document.healerCanonicalCount).toBe(2)
    expect(document.utilitySupportCanonicalCount).toBe(document.supportCanonicalCount - 2)
  })

  it('numeric key role and supportSubtype', () => {
    const document = buildCharacterGradeRulesDocument()
    const leni = document.entries.find((entry) => entry.numericKey === '69:9')
    expect(leni?.supportSubtype).toBe('utility')
    expect(leni?.liveRoleModePotential).toContain('support-utility-combat')
    const charlotte = document.entries.find((entry) => entry.numericKey === '73:24')
    expect(charlotte?.supportSubtype).toBe('healer')
    expect(resolveSupportSubtype(41, 24, '서포터')).toBe('healer')
  })

  it('legacy weights match config', () => {
    const document = buildCharacterGradeRulesDocument()
    for (const entry of document.entries) {
      expect(entry.legacyRolePreset).toEqual(ROLE_PRESET_WEIGHTS[entry.role])
    }
  })
})
