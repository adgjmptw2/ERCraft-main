// MOCK — 데모 캐릭터 세부 등급 (API 연동 전)

export type CharacterFineGrade =
  | 'S+'
  | 'S'
  | 'S-'
  | 'A+'
  | 'A'
  | 'A-'
  | 'B+'
  | 'B'
  | 'B-'
  | 'C+'
  | 'C'
  | 'C-'
  | 'D+'
  | 'D'
  | 'D-'

const FINE_GRADES: CharacterFineGrade[] = [
  'S+',
  'S',
  'S-',
  'A+',
  'A',
  'A-',
  'B+',
  'B',
  'B-',
  'C+',
  'C',
  'C-',
  'D+',
  'D',
  'D-',
]

function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

function hashString(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

export function getDemoCharacterFineGrade(
  userNum: number,
  seasonNumber: number,
  characterName: string,
): CharacterFineGrade {
  const seed = userNum * 31 + seasonNumber * 17 + hashString(characterName)
  const index = Math.floor(pseudoRandom(seed) * FINE_GRADES.length)
  return FINE_GRADES[index] ?? 'B'
}

export function getDemoCharacterAvgDamage(
  userNum: number,
  seasonNumber: number,
  characterName: string,
): number {
  const seed = userNum * 41 + seasonNumber * 23 + hashString(characterName) + 7
  const raw = 12_000 + pseudoRandom(seed) * 23_000
  return Math.round(raw / 100) * 100
}

export function fineGradeColor(grade: CharacterFineGrade): string {
  const head = grade.charAt(0)
  if (head === 'S') return '#f0b429'
  if (head === 'A') return '#4ade80'
  if (head === 'B') return '#60a5fa'
  if (head === 'C') return '#9ca3af'
  return '#f87171'
}
