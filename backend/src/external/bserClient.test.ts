import { describe, expect, it, vi, afterEach } from 'vitest'

import { BserApiError, BserClient, normalizeBserUser, resetBserStaticCachesForTests, BSER_MIN_INTERVAL_MS, BSER_BURST_SIZE } from './bserClient.js'

describe('normalizeBserUser', () => {
  it('maps BSER v11 userId field to uid', () => {
    expect(
      normalizeBserUser({
        nickname: '절단마술사',
        userId: 'XqFcJ9TekDqmX5z6bmkmsrh2usBmAttHL-IGFYA6BL25aKY6IQoiZNzrbbCe2zIzz1rj',
      }),
    ).toEqual({
      uid: 'XqFcJ9TekDqmX5z6bmkmsrh2usBmAttHL-IGFYA6BL25aKY6IQoiZNzrbbCe2zIzz1rj',
      nickname: '절단마술사',
    })
  })

  it('keeps legacy uid field', () => {
    expect(
      normalizeBserUser({
        nickname: 'Neo',
        uid: 'legacy-uid',
      }),
    ).toEqual({
      uid: 'legacy-uid',
      nickname: 'Neo',
    })
  })

  it('returns null when uid/userId missing', () => {
    expect(normalizeBserUser({ nickname: 'ghost' })).toBeNull()
    expect(normalizeBserUser(null)).toBeNull()
  })
})

describe('BserClient timeout', () => {
  afterEach(() => {
    resetBserStaticCachesForTests()
    vi.restoreAllMocks()
    delete process.env.BSER_REQUEST_TIMEOUT_MS
  })

  it('request timeout — BserApiError 504', async () => {
    process.env.BSER_REQUEST_TIMEOUT_MS = '200'
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal
        if (signal) {
          signal.addEventListener('abort', () => {
            const err = new Error('The operation was aborted')
            err.name = 'AbortError'
            reject(err)
          })
        }
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const client = new BserClient('test-key')
    await expect(client.getUserByNickname('timeout-user')).rejects.toMatchObject({
      status: 504,
      message: 'BSER request timeout',
    })
  })

  it('429/403 retry — 최대 2회 재시도 후 중단', async () => {
    let calls = 0
    const fetchMock = vi.fn(async () => {
      calls += 1
      return new Response(JSON.stringify({ code: 429, message: 'rate limited' }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const client = new BserClient('test-key')
    await expect(client.getUserByNickname('rate-user')).rejects.toBeInstanceOf(BserApiError)
    expect(calls).toBe(3)
  }, 10_000)
})

describe('BserClient static caches', () => {
  afterEach(() => {
    resetBserStaticCachesForTests()
    vi.restoreAllMocks()
  })

  it('getCharacterNames — 동시 호출해도 l10n 메타는 1회만', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.includes('/v1/l10n/Korean')) {
        return new Response(
          JSON.stringify({ code: 200, message: 'ok', data: { l10Path: 'https://l10n.test/ko.txt' } }),
          { status: 200 },
        )
      }
      if (url === 'https://l10n.test/ko.txt') {
        return new Response('Character/Name/11┃유키\n', { status: 200 })
      }
      throw new Error(`unexpected fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const client = new BserClient('test-key')
    const [a, b] = await Promise.all([client.getCharacterNames(), client.getCharacterNames()])

    expect(a.get(11)).toBe('유키')
    expect(b.get(11)).toBe('유키')
    expect(fetchMock.mock.calls.filter(([u]) => String(u).includes('/v1/l10n/Korean'))).toHaveLength(1)
  })

  it('getSeasonRows — 재호출 시 BSER Season API 1회만', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.includes('/v2/data/Season')) {
        return new Response(
          JSON.stringify({
            code: 200,
            message: 'ok',
            data: [{ seasonID: 1, seasonName: 'Season20', isCurrent: 1 }],
          }),
          { status: 200 },
        )
      }
      throw new Error(`unexpected fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const client = new BserClient('test-key')
    const [a, b] = await Promise.all([client.getSeasonRows(), client.getSeasonRows()])

    expect(a).toHaveLength(1)
    expect(b[0]?.seasonID).toBe(1)
    expect(fetchMock.mock.calls.filter(([u]) => String(u).includes('/v2/data/Season'))).toHaveLength(1)
  })
})

describe('BserRequestLimiter', () => {
  afterEach(() => {
    resetBserStaticCachesForTests()
    vi.restoreAllMocks()
  })

  function okNicknameResponse(): Response {
    return new Response(
      JSON.stringify({
        code: 200,
        message: 'ok',
        user: { nickname: 'test', userId: 'uid-1' },
      }),
      { status: 200 },
    )
  }

  it(`burst ${BSER_BURST_SIZE} 후 ${BSER_MIN_INTERVAL_MS}ms 간격으로 순차 시작`, async () => {
    const startedAt: number[] = []
    const fetchMock = vi.fn(async () => {
      startedAt.push(Date.now())
      return okNicknameResponse()
    })
    vi.stubGlobal('fetch', fetchMock)

    const client = new BserClient('test-key')
    await Promise.all([
      client.getUserByNickname('a'),
      client.getUserByNickname('b'),
      client.getUserByNickname('c'),
    ])

    expect(startedAt).toHaveLength(3)
    expect(startedAt[1]! - startedAt[0]!).toBeLessThan(200)
    expect(startedAt[2]! - startedAt[1]!).toBeGreaterThanOrEqual(BSER_MIN_INTERVAL_MS - 50)
  }, 15_000)
})
