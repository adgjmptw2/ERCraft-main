import { describe, expect, it } from 'vitest'

import { resolveExclusiveTierBandFromTierKey } from './tierBand.js'

describe('tierBand', () => {
  it('passes through already-exclusive tier bands', () => {
    expect(resolveExclusiveTierBandFromTierKey('diamond')).toBe('diamond')
    expect(resolveExclusiveTierBandFromTierKey('mithril')).toBe('mithril')
  })

  it('maps legacy baseline keys to exclusive bands', () => {
    expect(resolveExclusiveTierBandFromTierKey('diamond_plus')).toBe('diamond')
    expect(resolveExclusiveTierBandFromTierKey('mithril_plus')).toBe('mithril')
  })
})