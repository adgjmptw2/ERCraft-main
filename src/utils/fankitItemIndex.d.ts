declare module '../../scripts/lib/fankitItemIndex.mjs' {
  export function lookupFankitItem(code: number): {
    nameKo?: string
    nameEn?: string
    assetSlug?: string
  } | null
}
