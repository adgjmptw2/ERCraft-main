import { describe, expect, it } from 'vitest'

import { mapGameToEquipmentPreview } from '@/utils/equipmentPreviewMapper'

describe('mapGameToEquipmentPreview', () => {
  it('BSER 장비 코드 필드 매핑', () => {
    const preview = mapGameToEquipmentPreview({
      bestWeapon: 6,
      tacticalSkillGroup: 30,
      traitFirstCore: 7000401,
      traitFirstSub: [7010501, 7011401],
      traitSecondSub: [7111101, 7110201],
      equipment: [113408, 202508, 201504, 205508, 204419],
      equipmentGrade: [5, 5, 5, 5, 4],
    })

    expect(preview?.weaponTypeSlug).toBe('weapons/weapon-group/shuriken')
    expect(preview?.tacticalSkillSlug).toBe('tactical-skills/blink')
    expect(preview?.mainTraitSlug).toBe('havoc/vampiric-bloodline')
    expect(preview?.subTraitSlug).toBe('fortification/fortification1')
    expect(preview?.gear?.weapon).toBe('weapons/shuriken/frost-venom-dart')
    expect(preview?.gear?.chest).toBe('armor/chest/elegant-gown')
    expect(preview?.gear?.head).toBe('armor/head/sultan-s-turban')
    expect(preview?.gear?.arm).toBe('armor/arm-accessory/emerald-tablet')
    expect(preview?.gear?.leg).toBe('armor/leg/delta-red')
    expect(preview?.gearGrade?.weapon).toBe('legend')
    expect(preview?.gearGrade?.leg).toBe('epic')
  })

  it('전술 스킬 그룹 171(plasma dash) slug 매핑', () => {
    const preview = mapGameToEquipmentPreview({
      tacticalSkillGroup: 171,
    })

    expect(preview?.tacticalSkillSlug).toBe('tactical-skills/plasma-dash')
  })

  it('혈액 인챈트 무기 코드(101701)도 아이콘 slug로 매핑', () => {
    const preview = mapGameToEquipmentPreview({
      bestWeapon: 1,
      equipment: { 0: 101701 },
      equipmentGrade: { 0: 6 },
    })

    expect(preview?.gear?.weapon).toBe('weapons/dagger/scarlet-dagger')
    expect(preview?.gearGrade?.weapon).toBe('blood')
  })

  it('미스릴 투구·SCV·선녀강림 장비 코드 매핑', () => {
    const preview = mapGameToEquipmentPreview({
      equipment: { 0: 101101, 1: 202509, 2: 201403, 3: 203101, 4: 204415 },
    })

    expect(preview?.gear?.head).toBe('armor/head/mithril-helm')
    expect(preview?.gear?.chest).toBe('armor/chest/beautiful-garnment')
    expect(preview?.gear?.leg).toBe('armor/leg/scv-self-controlled-vehicle')
  })

  it('BSER 객체형 equipment/equipmentGrade 매핑', () => {
    const preview = mapGameToEquipmentPreview({
      bestWeapon: 6,
      tacticalSkillGroup: 30,
      traitFirstCore: 7200501,
      traitSecondSub: [7310201, 7310301],
      equipment: { '0': 113405, '1': 202508, '2': 705620, '3': 205504, '4': 204419 },
      equipmentGrade: { '0': 4, '1': 5, '2': 5, '3': 5, '4': 4 },
    })

    expect(preview?.weaponTypeSlug).toBe('weapons/weapon-group/shuriken')
    expect(preview?.tacticalSkillSlug).toBe('tactical-skills/blink')
    expect(preview?.gear?.weapon).toBeTruthy()
    expect(preview?.gear?.head).toBeTruthy()
    expect(preview?.gearGrade?.weapon).toBe('epic')
  })

  it('보조 특성 슬롯은 개별 특성이 아니라 트리 대표 아이콘으로 매핑', () => {
    const preview = mapGameToEquipmentPreview({
      traitSecondSub: [7011501, 7011101],
    })

    expect(preview?.subTraitSlug).toBe('havoc/havoc2')
  })

  it('매핑 없는 코드는 빈 슬롯', () => {
    const preview = mapGameToEquipmentPreview({
      bestWeapon: 999,
      equipment: [1],
    })
    expect(preview).toBeUndefined()
  })
})
