/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  readonly VITE_USE_REAL_API?: string
  readonly VITE_ASSET_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '../../scripts/lib/fankitItemIndex.mjs' {
  export function lookupFankitItem(code: number): {
    nameKo?: string
    nameEn?: string
    assetSlug?: string
  } | null
  export function buildFankitAssetIndex(rootPath: string): Promise<unknown>
  export function resolveFankitSource(slug: string, index: unknown): string
}