import type { FastifyRequest } from 'fastify'

import { HttpError } from '../utils/httpError.js'

const STUB_PROVIDER = 'stub'

// X-User-Id stub → users.id 저장
export async function authMiddleware(request: FastifyRequest): Promise<void> {
  const raw = request.headers['x-user-id']
  const headerValue = Array.isArray(raw) ? raw[0] : raw
  if (typeof headerValue !== 'string' || !headerValue.trim()) {
    throw new HttpError(401, 'UNAUTHORIZED', 'Missing or invalid X-User-Id header')
  }

  const stubSubject = headerValue.trim()
  const user = await request.server.prisma.user.upsert({
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
    select: { id: true },
  })

  request.userId = user.id
}
