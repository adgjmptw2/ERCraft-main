import { AxiosError } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
}))

vi.mock('@/api/client', () => ({
  apiClient: { get: getMock },
}))

import { RealEternalReturnClient } from '@/api/erClient.real'
import { ApiError } from '@/utils/apiError'

describe('RealEternalReturnClient', () => {
  const client = new RealEternalReturnClient()

  beforeEach(() => {
    getMock.mockReset()
  })

  it('searchPlayers — /api/players/search?q= 호출', async () => {
    getMock.mockResolvedValueOnce({
      data: { data: [{ userNum: 1, nickname: 'Neo', tier: 'Gold', level: 1, mmr: 1000 }] },
    })
    const result = await client.searchPlayers('  Neo  ')
    expect(getMock).toHaveBeenCalledWith('/api/players/search', {
      params: { q: 'Neo' },
      timeout: 20_000,
    })
    expect(result).toHaveLength(1)
  })

  it('404 → 사용자용 PLAYER_NOT_FOUND 메시지', async () => {
    getMock.mockRejectedValueOnce(
      new AxiosError('Not Found', 'ERR_BAD_REQUEST', undefined, undefined, {
        status: 404,
        data: {
          error: {
            code: 'PLAYER_NOT_FOUND',
            message: '플레이어를 찾을 수 없습니다. 닉네임을 정확히 입력해 주세요.',
          },
        },
        statusText: 'Not Found',
        headers: {},
        config: { headers: {} },
      } as never),
    )
    await expect(client.searchPlayers('ghost')).rejects.toMatchObject({
      code: 'PLAYER_NOT_FOUND',
      message: '플레이어를 찾을 수 없습니다. 닉네임을 정확히 입력해 주세요.',
    })
  })

  it('503 → API key 문구 노출 없음', async () => {
    getMock.mockRejectedValueOnce(
      new AxiosError('Service Unavailable', 'ERR_BAD_RESPONSE', undefined, undefined, {
        status: 503,
        data: {
          error: {
            code: 'UPSTREAM_ERROR',
            message: 'BSER_API_KEY is not configured',
          },
        },
        statusText: 'Service Unavailable',
        headers: {},
        config: { headers: {} },
      } as never),
    )
    await expect(client.searchPlayers('Neo')).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(ApiError)
      const apiErr = err as ApiError
      expect(apiErr.message).not.toMatch(/BSER_API_KEY|api[_-]?key/i)
      expect(apiErr.message).toContain('공식 API 연결')
      return true
    })
  })

  it('네트워크 오류 메시지', async () => {
    getMock.mockRejectedValueOnce(new AxiosError('Network Error'))
    await expect(client.searchPlayers('Neo')).rejects.toMatchObject({
      message: '백엔드 서버에 연결하지 못했습니다. localhost:3001 실행 상태를 확인해 주세요.',
    })
  })
})
