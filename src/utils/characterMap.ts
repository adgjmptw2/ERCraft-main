// MOCK — BSER API characterName → 공식 한국어 실험체명 (나무위키·인게임 명칭 기준, 2026-02)

import characterAssetData from '@/assets/characterNumToAssetFolder.generated.json'
import characterNumData from '@/assets/characterNumToKo.generated.json'

/** API/JSON 영문명 → 한국어 */
export const CHARACTER_EN_TO_KO: Record<string, string> = {
  Jackie: '재키',
  Aya: '아야',
  Hyunwoo: '현우',
  Magnus: '매그너스',
  Fiona: '피오라',
  Fiora: '피오라',
  Nadine: '나딘',
  Zahir: '자히르',
  Hart: '하트',
  Isol: '아이솔',
  'Li Dailin': '리 다이린',
  LiDailin: '리 다이린',
  Yuki: '유키',
  Hyejin: '혜진',
  Shoichi: '쇼이치',
  Xiukai: '쇼우',
  Sissela: '시셀라',
  Chiara: '키아라',
  Adriana: '아드리아나',
  Silvia: '실비아',
  Emma: '엠마',
  Lennox: '레녹스',
  Lenox: '레녹스',
  Rozzi: '로지',
  Luke: '루크',
  Cathy: '캐시',
  Adela: '아델라',
  Bernice: '버니스',
  Barbara: '바바라',
  Alex: '알렉스',
  Sua: '수아',
  Leon: '레온',
  Eleven: '일레븐',
  Rio: '리오',
  William: '윌리엄',
  Nicky: '니키',
  Nathapon: '나타폰',
  Jan: '얀',
  Eva: '이바',
  Daniel: '다니엘',
  Jenny: '제니',
  Camilo: '카밀로',
  Chloe: '클로에',
  Johann: '요한',
  Bianca: '비앙카',
  Celine: '셀린',
  Echion: '에키온',
  Mai: '마이',
  Aiden: '에이든',
  Laura: '라우라',
  Tia: '띠아',
  Felix: '펠릭스',
  Elena: '엘레나',
  Priya: '프리야',
  Adina: '아디나',
  Markus: '마커스',
  Karla: '칼라',
  Estelle: '에스텔',
  Piolo: '피올로',
  Martina: '마르티나',
  Hayes: '헤이즈',
  Haze: '헤이즈',
  Isaac: '아이작',
  Tazia: '타지아',
  Irene: '이렘',
  Theodore: '테오도르',
  Ian: '이안',
  Lyanh: '이안',
  Vanya: '바냐',
  'Debi & Marlene': '데비&마를렌',
  DebiMarlene: '데비&마를렌',
  Arda: '아르다',
  Abigail: '아비게일',
  Alonso: '알론소',
  Lenny: '레니',
  Leni: '레니',
  Tsubame: '츠바메',
  Kenneth: '케네스',
  Katja: '카티야',
  Charlotte: '샬럿',
  Darko: '다르코',
  Lenore: '르노어',
  Garnet: '가넷',
  Yumin: '유민',
  YuMin: '유민',
  Hisui: '히스이',
  Justyna: '유스티나',
  Istvan: '이슈트반',
  'István': '이슈트반',
  Nia: '니아',
  Niah: '니아',
  Shurin: '슈린',
  Xuelin: '슈린',
  Henry: '헨리',
  Blair: '블레어',
  Mirka: '미르카',
  Fenrir: '펜리르',
  Coraline: '코렐라인',
  // 출시 예정
  BHyun: '비형',
  Bihyung: '비형',
  Craver: '크레이버',
}

const CHARACTER_NUM_TO_KO: ReadonlyMap<number, string> = new Map(
  Object.entries(characterNumData.characterNumToKo).flatMap(([code, name]) => {
    const num = Number(code)
    const ko = name.trim()
    if (!Number.isInteger(num) || num <= 0 || !ko) return []
    return [[num, ko] as const]
  }),
)

const CHARACTER_NUM_TO_ASSET_FOLDER: ReadonlyMap<number, number> = new Map(
  Object.entries(characterAssetData.characterNumToAssetFolder).flatMap(([code, folder]) => {
    const num = Number(code)
    const assetFolder = typeof folder === 'number' ? folder : Number(folder)
    if (!Number.isInteger(num) || num <= 0 || !Number.isInteger(assetFolder) || assetFolder <= 0) {
      return []
    }
    return [[num, assetFolder] as const]
  }),
)

/** 출시순 한국어 실험체 전체 (펜리르까지 86명 + 예정 2명) */
export const CHARACTER_KO_RELEASE_ORDER: readonly string[] = [
  '재키',
  '아야',
  '현우',
  '매그너스',
  '피오라',
  '나딘',
  '자히르',
  '하트',
  '아이솔',
  '리 다이린',
  '유키',
  '혜진',
  '쇼이치',
  '시셀라',
  '키아라',
  '아드리아나',
  '실비아',
  '엠마',
  '레녹스',
  '로지',
  '루크',
  '캐시',
  '아델라',
  '버니스',
  '바바라',
  '알렉스',
  '수아',
  '레온',
  '일레븐',
  '리오',
  '윌리엄',
  '니키',
  '나타폰',
  '얀',
  '이바',
  '다니엘',
  '제니',
  '카밀로',
  '클로에',
  '요한',
  '비앙카',
  '셀린',
  '에키온',
  '마이',
  '에이든',
  '라우라',
  '띠아',
  '펠릭스',
  '엘레나',
  '프리야',
  '아디나',
  '마커스',
  '칼라',
  '에스텔',
  '피올로',
  '마르티나',
  '헤이즈',
  '아이작',
  '타지아',
  '이렘',
  '테오도르',
  '이안',
  '바냐',
  '데비&마를렌',
  '아르다',
  '아비게일',
  '알론소',
  '레니',
  '츠바메',
  '케네스',
  '카티야',
  '샬럿',
  '다르코',
  '르노어',
  '가넷',
  '유민',
  '히스이',
  '유스티나',
  '이슈트반',
  '니아',
  '슈린',
  '헨리',
  '블레어',
  '미르카',
  '펜리르',
  '코렐라인',
  '비형',
  '크레이버',
]

function normalizeCharacterKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ')
}

export function localizeCharacterName(name: string): string {
  const trimmed = normalizeCharacterKey(name)
  if (!trimmed) return '—'

  const direct = CHARACTER_EN_TO_KO[trimmed]
  if (direct) return direct

  const collapsed = trimmed.replace(/\s+/g, '')
  const fromCollapsed = CHARACTER_EN_TO_KO[collapsed]
  if (fromCollapsed) return fromCollapsed

  return trimmed
}

/**
 * Fankit/출시순 에셋 폴더 번호 — BSER characterNum과 다를 수 있음 (예: API 15 시셀라 → 폴더 14)
 */
export function resolveCharacterAssetNum(characterNum: number | null | undefined): number | null {
  const num =
    typeof characterNum === 'number' && Number.isInteger(characterNum) && characterNum > 0
      ? characterNum
      : null

  if (num !== null) {
    const folder = CHARACTER_NUM_TO_ASSET_FOLDER.get(num)
    if (folder !== undefined) return folder
  }

  return num
}

/** 숫자만으로 된 characterName은 유효한 이름이 아님 */
export function isNumericCharacterName(value: unknown): boolean {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  return trimmed.length > 0 && /^\d+$/.test(trimmed)
}

function isPlaceholderCharacterName(
  name: string,
  characterNum: number | null | undefined,
): boolean {
  const trimmed = name.trim()
  if (
    typeof characterNum === 'number' &&
    Number.isInteger(characterNum) &&
    characterNum > 0 &&
    (trimmed === `실험체 #${characterNum}` || trimmed === `실험체 ${characterNum}`)
  ) {
    return true
  }
  return /^실험체\s*#?\d+$/u.test(trimmed)
}

/** 유효한 API name → 정적 map → "실험체 N" */
export function resolveCharacterDisplayName(
  characterNum: number | null | undefined,
  characterName: string | null | undefined,
): string {
  const fromNum =
    typeof characterNum === 'number' && Number.isInteger(characterNum) && characterNum > 0
      ? CHARACTER_NUM_TO_KO.get(characterNum)
      : undefined

  const name = characterName?.trim()
  if (name && !isNumericCharacterName(name) && !isPlaceholderCharacterName(name, characterNum)) {
    const localized = localizeCharacterName(name)
    if (localized !== '—' && !isNumericCharacterName(localized)) {
      if (fromNum && localized !== fromNum) {
        return fromNum
      }
      return localized
    }
  }

  if (fromNum) return fromNum

  if (typeof characterNum === 'number' && Number.isInteger(characterNum) && characterNum > 0) {
    return `실험체 ${characterNum}`
  }

  return '알 수 없음'
}

export function getAllCharacterKoNames(): string[] {
  return [...CHARACTER_KO_RELEASE_ORDER]
}
