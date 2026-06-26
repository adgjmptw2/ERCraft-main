import 'dotenv/config'

const API_BASE = process.env.LATENCY_API_BASE ?? 'http://127.0.0.1:3001'
const ENDPOINTS = [
  '/health',
  '/api/benchmark/status',
  '/api/players/gapri/summary',
  '/api/players/gapri/stats',
  '/api/players/gapri/matches?page=1&pageSize=20',
]

interface Sample {
  endpoint: string
  ms: number
  status: number
  error?: string
}

async function probe(endpoint: string): Promise<Sample> {
  const started = performance.now()
  try {
    const response = await fetch(`${API_BASE}${endpoint}`)
    const ms = performance.now() - started
    return { endpoint, ms, status: response.status }
  } catch (error) {
    const ms = performance.now() - started
    const message = error instanceof Error ? error.message : String(error)
    return { endpoint, ms, status: 0, error: message }
  }
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return Math.round(sorted[index]!)
}

async function runRound(label: string, rounds: number): Promise<void> {
  const samples: Sample[] = []
  for (let round = 0; round < rounds; round += 1) {
    for (const endpoint of ENDPOINTS) {
      samples.push(await probe(endpoint))
    }
  }

  const byEndpoint = new Map<string, number[]>()
  const errors: Sample[] = []
  for (const sample of samples) {
    if (sample.status === 0 || sample.status >= 400) errors.push(sample)
    const list = byEndpoint.get(sample.endpoint) ?? []
    list.push(sample.ms)
    byEndpoint.set(sample.endpoint, list)
  }

  const summary = [...byEndpoint.entries()].map(([endpoint, values]) => ({
    endpoint,
    count: values.length,
    p50: percentile(values, 50),
    p95: percentile(values, 95),
    max: Math.round(Math.max(...values)),
  }))

  console.log(
    JSON.stringify(
      {
        label,
        apiBase: API_BASE,
        summary,
        errors,
      },
      null,
      2,
    ),
  )
}

const mode = process.argv[2] ?? 'idle'
const rounds = Number(process.argv[3] ?? 5)
void runRound(mode, Number.isFinite(rounds) ? rounds : 5)
