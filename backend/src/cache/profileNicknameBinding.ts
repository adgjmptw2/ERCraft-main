import type { PrismaClient } from '@prisma/client'

import { uidToUserNum } from '../external/bserMapper.js'

function isModelReady(prisma: PrismaClient): boolean {
  const delegate = (prisma as unknown as Record<string, unknown>).profileNicknameBinding
  return (
    typeof delegate === 'object' &&
    delegate !== null &&
    typeof (delegate as { findUnique?: unknown }).findUnique === 'function'
  )
}

export interface PersistedNicknameBinding {
  canonicalUid: string
  canonicalUserNum: number
}

export async function readPersistedNicknameBinding(
  prisma: PrismaClient,
  nickname: string,
): Promise<PersistedNicknameBinding | null> {
  if (!isModelReady(prisma)) return null
  const normalizedNickname = nickname.trim().toLowerCase()
  if (!normalizedNickname) return null
  const row = await prisma.profileNicknameBinding.findUnique({
    where: { normalizedNickname },
    select: { canonicalUid: true, canonicalUserNum: true },
  })
  if (!row) return null
  return {
    canonicalUid: row.canonicalUid,
    canonicalUserNum: Number(row.canonicalUserNum),
  }
}

export async function deleteNicknameBinding(
  prisma: PrismaClient,
  nickname: string,
): Promise<boolean> {
  if (!isModelReady(prisma)) return false
  const normalizedNickname = nickname.trim().toLowerCase()
  if (!normalizedNickname) return false
  try {
    await prisma.profileNicknameBinding.delete({ where: { normalizedNickname } })
    return true
  } catch {
    return false
  }
}

export async function persistNicknameBinding(
  prisma: PrismaClient,
  nickname: string,
  canonicalUid: string,
): Promise<void> {
  if (!isModelReady(prisma)) return
  const normalizedNickname = nickname.trim().toLowerCase()
  if (!normalizedNickname || !canonicalUid) return
  const canonicalUserNum = BigInt(uidToUserNum(canonicalUid))
  await prisma.profileNicknameBinding.upsert({
    where: { normalizedNickname },
    create: {
      normalizedNickname,
      canonicalUid,
      canonicalUserNum,
    },
    update: {
      canonicalUid,
      canonicalUserNum,
    },
  })
}
