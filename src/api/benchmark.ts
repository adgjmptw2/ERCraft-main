import { apiClient } from '@/api/client'
import type { ApiResult } from '@/types/api'
import type { BenchmarkStatus } from '@/types/benchmark'

export async function fetchBenchmarkStatus(): Promise<BenchmarkStatus> {
  const res = await apiClient.get<ApiResult<BenchmarkStatus>>('/api/benchmark/status', {
    timeout: 8_000,
  })
  return res.data.data
}
