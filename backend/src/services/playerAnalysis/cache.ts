import type { PlayerAnalysisResponse, PlayerAnalysisScope } from './types.js'
import { analysisCacheKey } from './builder.js'

const cache = new Map<string, PlayerAnalysisResponse>()

export function readPlayerAnalysisCache(params: {
  canonicalUid: string
  seasonId: number
  scope: PlayerAnalysisScope
  fingerprint: string
}): PlayerAnalysisResponse | null {
  const key = analysisCacheKey(params)
  const cached = cache.get(key)
  if (!cached) return null
  if (cached.sourceFingerprint !== params.fingerprint) return null
  return cached
}

export function writePlayerAnalysisCache(response: PlayerAnalysisResponse): void {
  const key = analysisCacheKey({
    canonicalUid: response.owner.canonicalUid,
    seasonId: response.owner.seasonId,
    scope: response.scope,
    fingerprint: response.sourceFingerprint,
  })
  cache.set(key, response)
}

export function invalidatePlayerAnalysisCache(canonicalUid: string): void {
  for (const key of cache.keys()) {
    if (key.includes(canonicalUid)) {
      cache.delete(key)
    }
  }
}

export function clearPlayerAnalysisCache(): void {
  cache.clear()
}
