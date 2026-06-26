import { createHash } from 'node:crypto'

import type { RoleSnapshotWindow } from './types.js'

export function roleSnapshotId(params: {
  canonicalUid: string
  displaySeasonId: number
  primaryRole: string
  rowType: RoleSnapshotWindow
  benchmarkScope: string
  benchmarkVersion: string
}): string {
  return createHash('sha256')
    .update(
      [
        params.canonicalUid,
        params.displaySeasonId,
        params.primaryRole,
        params.rowType,
        params.benchmarkScope,
        params.benchmarkVersion,
      ].join(':'),
    )
    .digest('hex')
}

export function buildRoleSourceFingerprint(gameIds: ReadonlyArray<string>): string {
  const sorted = [...gameIds].sort()
  return createHash('sha256').update(sorted.join(',')).digest('hex')
}
