export interface FankitItemIndexModule {
  buildFankitAssetIndex: (rootPath: string) => Promise<unknown>
  resolveFankitSource: (slug: string, index: unknown) => string
}

const FANKIT_MODULE_PATH = '../../scripts/lib/fankitItemIndex.mjs'

export function loadFankitItemIndex(): Promise<FankitItemIndexModule> {
  const importer = new Function('path', 'return import(path)') as (
    path: string,
  ) => Promise<FankitItemIndexModule>
  return importer(FANKIT_MODULE_PATH)
}