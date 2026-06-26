import type { PrismaClient } from '@prisma/client'

import type { PlayerMatchRow } from '../../utils/playerMatchDedup.js'
import type { PlayerCharacterBenchmarkScope } from '../playerCharacterSnapshot/config.js'
import { upsertUserRoleSnapshots } from './sync.js'

const inflightKeys = new Set<string>()

function snapshotKey(params: {
  canonicalUid: string
  displaySeasonId: number
  benchmarkScope: PlayerCharacterBenchmarkScope
}): string {
  return `${params.canonicalUid}:${params.displaySeasonId}:${params.benchmarkScope}`
}

/** 응답을 막지 않고 현재 사용자 role snapshot만 백그라운드 upsert */
export function scheduleUserRoleSnapshotUpsert(
  prisma: PrismaClient,
  params: {
    rows: ReadonlyArray<PlayerMatchRow>
    canonicalUid: string
    displaySeasonId: number
    apiSeasonId: number
    benchmarkScope: PlayerCharacterBenchmarkScope
  },
): void {
  const key = snapshotKey(params)
  if (inflightKeys.has(key)) return
  inflightKeys.add(key)
  void upsertUserRoleSnapshots(prisma, params)
    .catch(() => undefined)
    .finally(() => {
      inflightKeys.delete(key)
    })
}
