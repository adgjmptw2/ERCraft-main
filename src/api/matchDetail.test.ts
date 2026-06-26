import { AxiosError } from 'axios'
import { describe, expect, it, vi, beforeEach } from 'vitest'

const getMock = vi.fn()

vi.mock('@/api/client', () => ({
  apiClient: {
    get: (...args: unknown[]) => getMock(...args),
  },
}))

import { fetchMatchDetail } from '@/api/matchDetail'

describe('fetchMatchDetail', () => {
  beforeEach(() => {
    getMock.mockReset()
  })

  it('/api/matches/:gameId/detail 경로를 사용한다', async () => {
    getMock.mockResolvedValue({
      data: {
        data: {
          gameId: '61599783',
          gameMode: 'rank',
          playedAt: '2026-06-10T10:00:00+09:00',
          detailStatus: 'ready',
          teams: [],
        },
        source: 'external',
        refreshedAt: '2026-06-10T10:00:00+09:00',
      },
    })

    await fetchMatchDetail('61599783')

    expect(getMock).toHaveBeenCalledWith('/api/matches/61599783/detail')
  })

  it('404 응답을 NOT_FOUND ApiError로 변환한다', async () => {
    getMock.mockRejectedValue(
      new AxiosError('Not Found', 'ERR_BAD_REQUEST', undefined, undefined, {
        status: 404,
        data: {},
        statusText: 'Not Found',
        headers: {},
        config: {} as never,
      }),
    )

    await expect(fetchMatchDetail('999')).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})
