import productCodesJson from '../data/cobaltInfusionProductCodes.json' with { type: 'json' }

/** BSER InfusionProduct.productCode whitelist for traitSecondSub equipped codes. */
export const KNOWN_COBALT_INFUSION_PRODUCT_CODES: ReadonlySet<number> = new Set(
  productCodesJson.productCodes,
)

export function isKnownCobaltInfusionProductCode(code: number): boolean {
  return KNOWN_COBALT_INFUSION_PRODUCT_CODES.has(code)
}