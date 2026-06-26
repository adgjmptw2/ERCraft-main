import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'

import {
  readPersistedProfileAliasUids,
  readPersistedProfileAliases,
  persistVerifiedProfileAliases,
} from './profileIdentityAlias.js'

function createAliasPrismaMock(rows: Array<{ canonicalUid: string; sourceUid: string; verificationMethod: string }>) {
  const store = [...rows]
  return {
    profileIdentityAlias: {
      findMany: vi.fn(async ({ where }: { where: { canonicalUid: string; isActive: boolean } }) =>
        store
          .filter((row) => row.canonicalUid === where.canonicalUid)
          .map((row) => ({
            sourceUid: row.sourceUid,
            verificationMethod: row.verificationMethod,
          })),
      ),
      upsert: vi.fn(
        async ({
          where,
          create,
        }: {
          where: { canonicalUid_sourceUid: { canonicalUid: string; sourceUid: string } }
          create: { canonicalUid: string; sourceUid: string; verificationMethod: string }
        }) => {
          const idx = store.findIndex(
            (row) =>
              row.canonicalUid === where.canonicalUid_sourceUid.canonicalUid &&
              row.sourceUid === where.canonicalUid_sourceUid.sourceUid,
          )
          if (idx >= 0) {
            store[idx] = { ...store[idx], verificationMethod: create.verificationMethod }
          } else {
            store.push({
              canonicalUid: create.canonicalUid,
              sourceUid: create.sourceUid,
              verificationMethod: create.verificationMethod,
            })
          }
        },
      ),
    },
  } as unknown as PrismaClient
}

describe('profileIdentityAlias', () => {
  it('readPersistedProfileAliases — 저장된 alias 복원', async () => {
    const prisma = createAliasPrismaMock([
      { canonicalUid: 'canon-1', sourceUid: 'alias-1', verificationMethod: 'known-alias' },
    ])
    await expect(readPersistedProfileAliases(prisma, 'canon-1')).resolves.toEqual([
      { sourceUid: 'alias-1', verificationMethod: 'known-alias' },
    ])
    await expect(readPersistedProfileAliasUids(prisma, 'canon-1')).resolves.toEqual(['alias-1'])
  })

  it('persistVerifiedProfileAliases — canonical/source upsert', async () => {
    const prisma = createAliasPrismaMock([])
    await persistVerifiedProfileAliases(prisma, 'canon-1', [
      { sourceUid: 'alias-2', verificationMethod: 'game-id-overlap' },
    ])
    await expect(readPersistedProfileAliasUids(prisma, 'canon-1')).resolves.toEqual(['alias-2'])
  })
})
