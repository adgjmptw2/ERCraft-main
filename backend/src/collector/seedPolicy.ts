import type { CollectorOperationMode } from './operationMode.js'

export function resolveIdentitySeedLimit(
  mode: CollectorOperationMode,
  explicitSeedLimit: number | undefined,
): number {
  if (explicitSeedLimit !== undefined) return Math.max(0, Math.floor(explicitSeedLimit))
  if (mode === 'expansion') return 500
  return 0
}

export function resolveQueueSeedLimit(
  mode: CollectorOperationMode,
  explicitSeedLimit: number | undefined,
): number {
  if (explicitSeedLimit !== undefined) return Math.max(0, Math.floor(explicitSeedLimit))
  if (mode === 'expansion') return 500
  return 0
}
