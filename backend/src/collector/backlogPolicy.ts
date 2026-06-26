import type { CollectorConfig } from './config.js'

export type IdentityBacklogStage = 'normal' | 'soft' | 'hard'

export interface EffectiveBudgetPercents {
  game: number
  identity: number
  user: number
  maintenance: number
  stage: IdentityBacklogStage
  pendingIdentities: number
  operationMode?: import('./operationMode.js').CollectorOperationMode
}

export interface BacklogPolicyConfig {
  softLimit: number
  hardLimit: number
  softEnter: number
  softExit: number
  hardEnter: number
  hardExit: number
  softGamePercent: number
  softIdentityPercent: number
  hardGamePercent: number
  hardIdentityPercent: number
}

export function loadBacklogPolicyConfig(config: CollectorConfig): BacklogPolicyConfig {
  return {
    softLimit: config.identityBacklogSoftLimit,
    hardLimit: config.identityBacklogHardLimit,
    softEnter: config.identityBacklogSoftEnter,
    softExit: config.identityBacklogSoftExit,
    hardEnter: config.identityBacklogHardEnter,
    hardExit: config.identityBacklogHardExit,
    softGamePercent: config.identityBacklogSoftGamePercent,
    softIdentityPercent: config.identityBacklogSoftIdentityPercent,
    hardGamePercent: config.identityBacklogHardGamePercent,
    hardIdentityPercent: config.identityBacklogHardIdentityPercent,
  }
}

export function resolveEffectiveBudgetPercents(
  config: CollectorConfig,
  pendingIdentities: number,
  previousStage: IdentityBacklogStage = 'normal',
): EffectiveBudgetPercents {
  const policy = loadBacklogPolicyConfig(config)
  let stage = previousStage

  if (stage === 'normal' && pendingIdentities >= policy.softEnter) stage = 'soft'
  if (stage === 'soft' && pendingIdentities >= policy.hardEnter) stage = 'hard'
  if (stage === 'hard' && pendingIdentities <= policy.hardExit) stage = 'soft'
  if (stage === 'soft' && pendingIdentities <= policy.softExit) stage = 'normal'

  const user = config.userBudgetPercent
  const maintenance = config.maintenanceBudgetPercent

  if (stage === 'hard') {
    return {
      game: policy.hardGamePercent,
      identity: policy.hardIdentityPercent,
      user,
      maintenance,
      stage,
      pendingIdentities,
    }
  }

  if (stage === 'soft') {
    return {
      game: policy.softGamePercent,
      identity: policy.softIdentityPercent,
      user,
      maintenance,
      stage,
      pendingIdentities,
    }
  }

  return {
    game: config.gameBudgetPercent,
    identity: config.identityBudgetPercent,
    user,
    maintenance,
    stage: 'normal',
    pendingIdentities,
  }
}
