export type UnknownRoleReason =
  | 'missing-best-weapon'
  | 'invalid-best-weapon'
  | 'participant-weapon-not-mapped'
  | 'raw-detail-weapon-missing'
  | 'weapon-item-mapping-missing'
  | 'character-weapon-baseline-missing'
  | 'character-metadata-missing'
  | 'unsupported-mode'
  | 'legacy-incomplete-row'
  | 'resolved-role'

export type WeaponBackfillSource =
  | 'player-match-raw-json'
  | 'match-participant'
  | 'match-detail-raw-json'
  | 'equipment-item-mapping'

export function classifyBestWeaponValue(
  bestWeapon: number | null | undefined,
): 'valid' | 'missing' | 'invalid' {
  if (bestWeapon == null) return 'missing'
  if (!Number.isFinite(bestWeapon) || bestWeapon <= 0) return 'invalid'
  return 'valid'
}

export function isRankPlayerMatchRow(gameMode: string): boolean {
  return gameMode === 'rank'
}
