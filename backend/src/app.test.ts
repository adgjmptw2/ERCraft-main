import { execSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { PrismaClient } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createApp } from './app.js'

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const hasTestDb = Boolean(process.env.TEST_DATABASE_URL?.trim())

describe.skipIf(!hasTestDb)('backend HTTP (TEST_DATABASE_URL)', () => {
  let prisma: PrismaClient
  let app: FastifyInstance

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!
    execSync('npx prisma migrate deploy', {
      cwd: backendRoot,
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL! },
    })
    prisma = new PrismaClient()
    app = await createApp({ prisma })
  })

  beforeEach(async () => {
    await prisma.user.deleteMany()
  })

  afterAll(async () => {
    await app.close()
  })

  const jsonHeaders = { 'content-type': 'application/json' as const }

  it('X-User-Id 없으면 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/favorites',
      headers: { ...jsonHeaders },
      payload: { playerUserNum: 1, nicknameSnapshot: 'a' },
    })
    expect(res.statusCode).toBe(401)
    const body = res.json() as { error: { code: string } }
    expect(body.error.code).toBe('UNAUTHORIZED')
  })

  it('POST /api/favorites 정상 → 201', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/favorites',
      headers: { ...jsonHeaders, 'x-user-id': 'user-a' },
      payload: { playerUserNum: 560733, nicknameSnapshot: 'Neo' },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json() as {
      data: { playerUserNum: number; nickname: string; addedAt: string }
      source: string
    }
    expect(body.data.playerUserNum).toBe(560733)
    expect(body.data.nickname).toBe('Neo')
    expect(body.source).toBe('external')
    expect(typeof body.data.addedAt).toBe('string')
  })

  it('POST /api/favorites 중복 → 409', async () => {
    const headers = { ...jsonHeaders, 'x-user-id': 'user-b' }
    const payload = { playerUserNum: 100001, nicknameSnapshot: 'Dup' }
    const first = await app.inject({ method: 'POST', url: '/api/favorites', headers, payload })
    expect(first.statusCode).toBe(201)
    const second = await app.inject({ method: 'POST', url: '/api/favorites', headers, payload })
    expect(second.statusCode).toBe(409)
    const body = second.json() as { error: { code: string } }
    expect(body.error.code).toBe('DUPLICATE_FAVORITE')
  })

  it('GET /api/favorites 목록', async () => {
    const headers = { ...jsonHeaders, 'x-user-id': 'user-c' }
    await app.inject({
      method: 'POST',
      url: '/api/favorites',
      headers,
      payload: { playerUserNum: 200002, nicknameSnapshot: 'One' },
    })
    await app.inject({
      method: 'POST',
      url: '/api/favorites',
      headers,
      payload: { playerUserNum: 200003, nicknameSnapshot: 'Two' },
    })
    const res = await app.inject({ method: 'GET', url: '/api/favorites', headers: { 'x-user-id': 'user-c' } })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { data: { playerUserNum: number; nickname: string }[] }
    expect(body.data.length).toBe(2)
    const nums = body.data.map((x) => x.playerUserNum).sort((a, b) => a - b)
    expect(nums).toEqual([200002, 200003])
  })

  it('POST /api/search-history query 빈 문자열 → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/search-history',
      headers: { ...jsonHeaders, 'x-user-id': 'user-d' },
      payload: { query: '   ' },
    })
    expect(res.statusCode).toBe(400)
    const body = res.json() as { error: { code: string } }
    expect(body.error.code).toBe('INVALID_REQUEST')
  })

  it('GET /api/search-history limit 100 → 최대 50건', async () => {
    const uid = 'user-limit'
    const headers = { ...jsonHeaders, 'x-user-id': uid }
    await app.inject({
      method: 'POST',
      url: '/api/search-history',
      headers,
      payload: { query: 'first' },
    })
    const u = await prisma.user.findUniqueOrThrow({
      where: { provider_providerSub: { provider: 'stub', providerSub: uid } },
    })
    for (let i = 0; i < 54; i++) {
      await prisma.searchHistory.create({
        data: {
          userId: u.id,
          query: `q${i}`,
          createdAt: new Date(Date.UTC(2026, 0, 1, 12, 0, 54 - i)),
        },
      })
    }
    const res = await app.inject({
      method: 'GET',
      url: '/api/search-history?limit=100',
      headers: { 'x-user-id': uid },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { data: unknown[] }
    expect(body.data.length).toBe(50)
  })
})
