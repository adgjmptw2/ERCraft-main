import characterNumData from '../data/characterNumToKo.generated.json' with { type: 'json' }

const CHARACTER_NUM_TO_KO: ReadonlyMap<number, string> = new Map(
  Object.entries(characterNumData.characterNumToKo).flatMap(([code, name]) => {
    const num = Number(code)
    const ko = name.trim()
    if (!Number.isInteger(num) || num <= 0 || !ko) return []
    return [[num, ko] as const]
  }),
)

export function isNumericCharacterName(value: unknown): boolean {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  return trimmed.length > 0 && /^\d+$/.test(trimmed)
}

export function isUsefulCharacterName(characterNum: number, value: unknown): value is string {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  if (!trimmed) return false
  if (isNumericCharacterName(trimmed)) return false
  if (trimmed === `실험체 #${characterNum}` || trimmed === `실험체 ${characterNum}`) return false
  return true
}

/** 유효한 API name → 정적 map → "실험체 N" */
export function resolveCharacterDisplayName(
  characterNum: number | null | undefined,
  characterName: string | null | undefined,
): string {
  const name = characterName?.trim()
  if (
    name &&
    isUsefulCharacterName(
      typeof characterNum === 'number' && Number.isInteger(characterNum) ? characterNum : 0,
      name,
    )
  ) {
    return name
  }

  if (typeof characterNum === 'number' && Number.isInteger(characterNum) && characterNum > 0) {
    const fromNum = CHARACTER_NUM_TO_KO.get(characterNum)
    if (fromNum) return fromNum
    return `실험체 ${characterNum}`
  }

  return '알 수 없음'
}
