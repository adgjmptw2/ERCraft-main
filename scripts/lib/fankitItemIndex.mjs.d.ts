export function lookupFankitItem(code: number): {
  nameKo?: string
  nameEn?: string
  assetSlug?: string
} | null

export function buildFankitAssetIndex(rootPath: string): Promise<unknown>
export function resolveFankitSource(slug: string, index: unknown): string