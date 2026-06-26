import type { PrismaClient } from '@prisma/client'

import type { ProfileIdentityVerificationMethod } from '../utils/resolvedProfileIdentity.js'

export interface PersistedProfileAlias {
  sourceUid: string
  verificationMethod: ProfileIdentityVerificationMethod
}

function isModelReady(prisma: PrismaClient): boolean {
  const delegate = (prisma as unknown as Record<string, unknown>).profileIdentityAlias
  return (
    typeof delegate === 'object' &&
    delegate !== null &&
    typeof (delegate as { findMany?: unknown }).findMany === 'function'
  )
}

export async function readPersistedProfileAliases(
  prisma: PrismaClient,
  canonicalUid: string,
): Promise<PersistedProfileAlias[]> {
  if (!canonicalUid || !isModelReady(prisma)) return []
  const rows = await prisma.profileIdentityAlias.findMany({
    where: { canonicalUid, isActive: true },
    select: { sourceUid: true, verificationMethod: true },
    orderBy: { lastSeenAt: 'desc' },
    take: 16,
  })
  return rows.map((row) => ({
    sourceUid: row.sourceUid,
    verificationMethod: row.verificationMethod as ProfileIdentityVerificationMethod,
  }))
}

export async function readPersistedProfileAliasUids(
  prisma: PrismaClient,
  canonicalUid: string,
): Promise<string[]> {
  const aliases = await readPersistedProfileAliases(prisma, canonicalUid)
  return aliases.map((row) => row.sourceUid).filter((uid) => uid.length > 0)
}

export async function persistVerifiedProfileAliases(
  prisma: PrismaClient,
  canonicalUid: string,
  aliases: Array<{
    sourceUid: string
    verificationMethod: ProfileIdentityVerificationMethod
    fingerprintHash?: string | null
  }>,
): Promise<void> {
  if (!canonicalUid || aliases.length === 0 || !isModelReady(prisma)) return
  const now = new Date()
  for (const alias of aliases) {
    if (!alias.sourceUid || alias.sourceUid === canonicalUid) continue
    await prisma.profileIdentityAlias.upsert({
      where: {
        canonicalUid_sourceUid: {
          canonicalUid,
          sourceUid: alias.sourceUid,
        },
      },
      create: {
        canonicalUid,
        sourceUid: alias.sourceUid,
        verificationMethod: alias.verificationMethod,
        fingerprintHash: alias.fingerprintHash ?? null,
        verifiedAt: now,
        lastSeenAt: now,
        isActive: true,
      },
      update: {
        verificationMethod: alias.verificationMethod,
        fingerprintHash: alias.fingerprintHash ?? null,
        lastSeenAt: now,
        isActive: true,
      },
    })
  }
}
