import { Prisma } from '@prisma/client'
import type { FastifyRequest } from 'fastify'

import { HttpError } from '../utils/httpError.js'

const STUB_PROVIDER = 'stub'

/**
 * X-User-Id stub. 나중에 JWT 검증만 이 파일에서 바꾸면 됨.
 * provider_sub = 헤더 값, users 행 upsert.
 */
export async function authMiddleware(request: FastifyRequest): Promise<void> {
  const raw = request.headers['x-user-id']
  const headerValue = Array.isArray(raw) ? raw[0] : raw
  if (typeof headerValue !== 'string' || !headerValue.trim()) {
    throw new HttpError(401, 'UNAUTHORIZED', 'Missing or invalid X-User-Id header')
  }

  const stubSubject = headerValue.trim()
  await request.server.prisma.user.upsert({
    where: {
      provider_providerSub: {
        provider: STUB_PROVIDER,
        providerSub: stubSubject,
      },
    },
    create: {
      provider: STUB_PROVIDER,
      providerSub: stubSubject,
    },
    update: {},
  })

  request.userId = stubSubject
}

export async function resolveStubUserId(
  prisma: import('@prisma/client').PrismaClient,
  stubSubject: string,
): Promise<string> {
  try {
    const user = await prisma.user.findUniqueOrThrow({
      where: {
        provider_providerSub: {
          provider: STUB_PROVIDER,
          providerSub: stubSubject,
        },
      },
      select: { id: true },
    })
    return user.id
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      throw new HttpError(500, 'INTERNAL_ERROR', 'User resolution failed')
    }
    throw e
  }
}
