import { describe, expect, it } from 'vitest'

import {
  extractTacticalSkillLevelFromGroupCode,
  normalizeTacticalSkillGroupCode,
  resolveTacticalSkillSlugFromGroupCode,
  resolveVerifiedTacticalSkillSlug,
} from '@/assets/loadoutAssetMap'

describe('loadoutAssetMap', () => {
  it('normalizeTacticalSkillGroupCode — 레벨 포함 코드를 10단위 그룹으로', () => {
    expect(normalizeTacticalSkillGroupCode(31)).toBe(30)
    expect(normalizeTacticalSkillGroupCode(121)).toBe(120)
    expect(normalizeTacticalSkillGroupCode(30)).toBe(30)
  })

  it('extractTacticalSkillLevelFromGroupCode — 끝자리 레벨', () => {
    expect(extractTacticalSkillLevelFromGroupCode(31)).toBe(1)
    expect(extractTacticalSkillLevelFromGroupCode(121)).toBe(1)
    expect(extractTacticalSkillLevelFromGroupCode(30)).toBeNull()
    expect(extractTacticalSkillLevelFromGroupCode(171)).toBe(1)
  })

  it('resolveTacticalSkillSlugFromGroupCode — 11.0 이후 전술 스킬 그룹', () => {
    expect(resolveTacticalSkillSlugFromGroupCode(121)).toBe('tactical-skills/the-strijder')
    expect(resolveTacticalSkillSlugFromGroupCode(161)).toBe('tactical-skills/repulsor-missiles')
    expect(resolveTacticalSkillSlugFromGroupCode(171)).toBe('tactical-skills/plasma-dash')
    expect(resolveTacticalSkillSlugFromGroupCode(191)).toBe('tactical-skills/wings-of-light')
    expect(resolveTacticalSkillSlugFromGroupCode(500241)).toBe('tactical-skills/lock-ontracker')
    expect(resolveVerifiedTacticalSkillSlug(resolveTacticalSkillSlugFromGroupCode(171))).toBe(
      'tactical-skills/plasma-dash',
    )
  })
})
