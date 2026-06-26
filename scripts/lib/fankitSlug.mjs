/** Fankit 파일·폴더 라벨 → manifest slug 세그먼트 */

const FANKIT_LABEL_OVERRIDES = {
  twohanded: 'two-handed',
  'two-handed-sword': 'two-handed-sword',
  'dual-swords': 'dual-swords',
  'vf-prosthetic': 'vf-prosthetic',
  throwing: 'throwing',
  shuriken: 'shuriken',
}

/**
 * @param {string} label  "043. Elegant Gown" | "01. Chest"
 */
export function fankitLabelToSlugSegment(label) {
  let base = label.replace(/^\d+\.\s*/, '').trim()
  const lower = base.toLowerCase()

  if (lower === 'twohanded sword' || lower === 'two-handed sword') {
    return 'two-handed-sword'
  }
  if (lower === 'dual swords') return 'dual-swords'
  if (lower === 'vf prosthetic') return 'vf-prosthetic'
  if (lower === 'arm, accessory') return 'arm-accessory'
  if (lower === 'weapon group') return 'weapon-group'

  const override = FANKIT_LABEL_OVERRIDES[lower.replace(/\s+/g, '-')]
  if (override) return override

  return base
    .toLowerCase()
    .replace(/[''`]/g, '')
    .replace(/,\s*/g, '-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * @param {string} fileName  "043. Elegant Gown.png"
 */
export function fankitFileNameToSlug(fileName) {
  const withoutExt = fileName.replace(/\.[^.]+$/, '')
  return fankitLabelToSlugSegment(withoutExt)
}

/**
 * @param {string} folderName  "083. Henry"
 */
export function fankitCharacterNumFromFolder(folderName) {
  const match = /^(\d+)\./.exec(folderName.trim())
  if (!match) return null
  const n = Number(match[1])
  return Number.isInteger(n) && n > 0 ? n : null
}
