import type { PrismaClient } from '@prisma/client'

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient
  }

  interface FastifyRequest {
    /** X-User-Id 헤더 값 (stub provider_sub). FK는 users.id UUID — 라우트에서 user 조회 후 사용 */
    userId: string
  }
}
