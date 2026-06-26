// BSER Open API 클라이언트 (OpenAPI 2026-05-04 / v11 기준)
// - 모든 요청에 x-api-key 필요
// - 응답은 { code, message, ...payload } 래퍼. HTTP 200이어도 body.code가 에러일 수 있음
// - userNum 검색은 폐지됨 → 닉네임으로 uid를 얻은 뒤 uid 기반 엔드포인트 사용
//
// 상세 매치(39.9A) — 공식 API 원천 조사:
// - GET /v1/games/{gameId} — Match Results 모델. userGames[]에 전 경기 참가자 BattleUserResult 반환.
// - getUserGames raw는 본인 1명만. 전체 참가자는 games/{gameId} 전용.
// - v11 응답은 nickname 중심(uid/userNum 필드 없음). uid는 저장 시 null 허용.
// - 필드: teamNumber, gameRank, KDA, damageToPlayer/Monster, damageFromPlayer, totalGainVFCredit,
//   equipment/trait/tactical, finalInfusion(cobalt), mmrAfter/rpAfter 등.

const BSER_BASE_URL = 'https://open-api.bser.io'

/** 스쿼드 랭크만 지원 (문서 4.2 / 4.3) */
export const BSER_MATCHING_MODE_RANKED = 3
export const BSER_TEAM_MODE_SQUAD = 3

export class BserApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'BserApiError'
    this.status = status
  }
}

export interface BserUser {
  uid: string
  nickname: string
}

/** BSER v11 닉네임 조회는 `userId` 필드를 쓰고, 구버전/문서는 `uid`를 쓴다 */
export function normalizeBserUser(raw: unknown): BserUser | null {
  if (typeof raw !== 'object' || raw === null) return null
  const row = raw as { uid?: unknown; userId?: unknown; nickname?: unknown }
  const uid =
    typeof row.uid === 'string'
      ? row.uid
      : typeof row.userId === 'string'
        ? row.userId
        : null
  const nickname = typeof row.nickname === 'string' ? row.nickname : ''
  return uid && nickname ? { uid, nickname } : null
}

export interface BserUserRank {
  mmr: number
  nickname: string
  rank: number
  serverCode?: number
  serverRank?: number
}

export interface BserCharacterStat {
  characterCode: number
  totalGames: number
  maxKillings: number
  top3: number
  wins: number
  averageRank: number
}

export interface BserUserStat {
  seasonId: number
  matchingMode: number
  matchingTeamMode: number
  mmr: number
  nickname?: string
  rank: number
  rankSize: number
  totalGames: number
  totalWins: number
  totalTeamKills: number
  totalDeaths: number
  averageRank: number
  averageKills: number
  averageAssistants: number
  top1: number
  top3: number
  characterStats?: BserCharacterStat[]
}

/** BattleUserResult 중 매핑에 쓰는 필드만 (문서 3.5) */
export interface BserUserGame {
  gameId: number
  seasonId: number
  matchingMode: number
  matchingTeamMode: number
  characterNum: number
  characterLevel: number
  skinCode?: number
  bestWeapon?: number
  tacticalSkillGroup?: number
  traitFirstCore?: number
  traitFirstSub?: number[]
  traitSecondSub?: number[]
  equipment?: number[] | Record<string, number>
  equipmentGrade?: number[] | Record<string, number>
  routeIdOfStart?: number
  routeSlotId?: number
  gameRank: number
  playerKill: number
  playerDeaths?: number
  playerAssistant: number
  monsterKill: number
  teamKill?: number
  victory: number
  startDtm: string
  playTime?: number
  duration?: number
  damageToPlayer?: number
  totalGainVFCredit?: number
  rpAfter?: number
  rp?: number
  rankPoint?: number
  mmrAfter?: number
  rpDelta?: number
  rpGain?: number
  rankPointGain?: number
  mmrGain?: number
  playerDamage?: number
  damageToPlayers?: number
  teamKills?: number
  gradeLabel?: string
  matchGrade?: string
  grade?: string
  rankGrade?: string
  viewContribution?: number
  accountLevel?: number
  /** Cobalt Protocol — FinalInfusion Int[3] */
  finalInfusion?: number[]
  /** Match Results — 참가자 식별 (v11 games 응답은 종종 nickname만 제공) */
  nickname?: string
  userNum?: number
  userId?: string
  uid?: string
  teamNumber?: number
  damageToMonster?: number
  damageFromPlayer?: number
  protectAbsorb?: number
  damageOffsetedByShield_Player?: number
  teamRecover?: number
  ccTimeToPlayer?: number
}

interface BserEnvelope {
  code: number
  message: string
  [key: string]: unknown
}

export interface BserSeasonRow {
  seasonID: number
  seasonName: string
  isCurrent: number
}

import { incrementBserRequestCount } from './bserMetrics.js'

/** BSER 공식 키 제한 — 1 RPS, burst 2 (BSER_MIN_INTERVAL_MS / BSER_BURST_SIZE) */
export const BSER_MIN_INTERVAL_MS = 1_000
export const BSER_BURST_SIZE = 2
/** 단일 BSER HTTP 요청 기본 타임아웃 (재시도 없음) */
export const BSER_REQUEST_TIMEOUT_MS = 9_000

export interface BserLimiterTiming {
  queuedAt: number
  startedAt: number
  completedAt: number
}

let lastLimiterTiming: BserLimiterTiming | null = null

export function peekBserLimiterTiming(): BserLimiterTiming | null {
  return lastLimiterTiming
}

function resolveBserRequestTimeoutMs(): number {
  const fromEnv = process.env.BSER_REQUEST_TIMEOUT_MS
  if (fromEnv !== undefined && fromEnv !== '') {
    const parsed = Number(fromEnv)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  return BSER_REQUEST_TIMEOUT_MS
}
const BSER_429_RETRY_DELAYS_MS = [1_500, 3_000]

/** 서버 재시작까지 유지 — Season·l10n 은 자주 변하지 않음 */
let seasonRowsPromise: Promise<BserSeasonRow[]> | null = null
const characterNamesPromises = new Map<string, Promise<Map<number, string>>>()

export function resetBserStaticCachesForTests(): void {
  seasonRowsPromise = null
  characterNamesPromises.clear()
  resetBserRequestLimiterForTests()
}

class BserRequestLimiter {
  private chain: Promise<unknown> = Promise.resolve()
  private tokens = BSER_BURST_SIZE
  private lastRefillAt = Date.now()

  reset(): void {
    this.chain = Promise.resolve()
    this.tokens = BSER_BURST_SIZE
    this.lastRefillAt = Date.now()
    lastLimiterTiming = null
  }

  private refillTokens(): void {
    const now = Date.now()
    const elapsed = now - this.lastRefillAt
    const gained = Math.floor(elapsed / BSER_MIN_INTERVAL_MS)
    if (gained <= 0) return
    this.tokens = Math.min(BSER_BURST_SIZE, this.tokens + gained)
    this.lastRefillAt += gained * BSER_MIN_INTERVAL_MS
  }

  run<T>(fn: () => Promise<T>): Promise<T> {
    const queuedAt = Date.now()
    const next = this.chain.then(async () => {
      this.refillTokens()
      if (this.tokens <= 0) {
        const wait = this.lastRefillAt + BSER_MIN_INTERVAL_MS - Date.now()
        if (wait > 0) await sleep(wait)
        this.refillTokens()
      }
      this.tokens -= 1
      const startedAt = Date.now()
      try {
        const result = await fn()
        lastLimiterTiming = { queuedAt, startedAt, completedAt: Date.now() }
        return result
      } catch (e) {
        lastLimiterTiming = { queuedAt, startedAt, completedAt: Date.now() }
        throw e
      }
    })
    this.chain = next.catch(() => undefined)
    return next as Promise<T>
  }
}

const bserRequestLimiter = new BserRequestLimiter()

export function resetBserRequestLimiterForTests(): void {
  bserRequestLimiter.reset()
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isAbortError(e: unknown): boolean {
  return (
    (e instanceof Error && e.name === 'AbortError') ||
    (typeof e === 'object' &&
      e !== null &&
      'name' in e &&
      (e as { name: unknown }).name === 'AbortError')
  )
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = resolveBserRequestTimeoutMs(),
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (e) {
    if (isAbortError(e)) {
      throw new BserApiError(504, 'BSER request timeout')
    }
    throw e
  } finally {
    clearTimeout(timer)
  }
}

export class BserClient {
  private readonly apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  get isConfigured(): boolean {
    return this.apiKey.length > 0
  }

  private async requestOnce(path: string): Promise<BserEnvelope> {
    incrementBserRequestCount()
    const res = await fetchWithTimeout(`${BSER_BASE_URL}${path}`, {
      headers: { 'x-api-key': this.apiKey, accept: 'application/json' },
    })

    let body: unknown = null
    try {
      body = await res.json()
    } catch {
      // 비정상 응답(HTML 등) — 아래에서 상태 코드로 처리
    }

    const envelope =
      typeof body === 'object' && body !== null ? (body as BserEnvelope) : null
    const code = envelope?.code ?? res.status

    if (!res.ok || code !== 200) {
      const status = code === 200 ? res.status : code
      throw new BserApiError(status, envelope?.message ?? `BSER request failed (${res.status})`)
    }
    if (!envelope) {
      throw new BserApiError(502, 'BSER returned an empty body')
    }
    return envelope
  }

  private async request(path: string): Promise<BserEnvelope> {
    return bserRequestLimiter.run(async () => {
      let lastError: unknown
      for (let attempt = 0; attempt <= BSER_429_RETRY_DELAYS_MS.length; attempt++) {
        try {
          return await this.requestOnce(path)
        } catch (e) {
          lastError = e
          const retriable = e instanceof BserApiError && (e.status === 429 || e.status === 403)
          const delay = BSER_429_RETRY_DELAYS_MS[attempt]
          if (!retriable || delay === undefined) throw e
          await sleep(delay)
        }
      }
      throw lastError
    })
  }

  /** UID 조회 (v1). 없는 닉네임이면 null */
  async getUserByNickname(nickname: string): Promise<BserUser | null> {
    try {
      const body = await this.request(`/v1/user/nickname?query=${encodeURIComponent(nickname)}`)
      return normalizeBserUser(body.user)
    } catch (e) {
      if (e instanceof BserApiError && e.status === 404) return null
      throw e
    }
  }

  /** 사용자 경기 목록 (v1, 최근 90일). next 커서로 페이지네이션 — 응답당 약 10건(공식 미문서) */
  async getUserGames(uid: string, next?: number): Promise<{ games: BserUserGame[]; next?: number }> {
    try {
      const suffix = next !== undefined ? `?next=${next}` : ''
      const body = await this.request(`/v1/user/games/uid/${encodeURIComponent(uid)}${suffix}`)
      const games = Array.isArray(body.userGames) ? (body.userGames as BserUserGame[]) : []
      const cursor = typeof body.next === 'number' ? body.next : undefined
      return { games, next: cursor }
    } catch (e) {
      if (e instanceof BserApiError && e.status === 404) return { games: [], next: undefined }
      throw e
    }
  }

  /**
   * 단일 경기 전체 참가자 BattleUserResult (Match Results).
   * gameId는 getUserGames 등에서 획득.
   */
  async getGame(gameId: number | string): Promise<BserUserGame[]> {
    try {
      const body = await this.request(`/v1/games/${encodeURIComponent(String(gameId))}`)
      return Array.isArray(body.userGames) ? (body.userGames as BserUserGame[]) : []
    } catch (e) {
      if (e instanceof BserApiError && e.status === 404) return []
      throw e
    }
  }

  /** 사용자 랭크 (v1, 스쿼드 전용). 랭크 정보 없으면 null */
  async getUserRank(uid: string, seasonId: number): Promise<BserUserRank | null> {
    try {
      const body = await this.request(
        `/v1/rank/uid/${encodeURIComponent(uid)}/${seasonId}/${BSER_TEAM_MODE_SQUAD}`,
      )
      return (body.userRank as BserUserRank | undefined) ?? null
    } catch (e) {
      if (e instanceof BserApiError && e.status === 404) return null
      throw e
    }
  }

  /** 사용자 통계 (v2). 랭크 대전 기준 */
  async getUserStats(uid: string, seasonId: number): Promise<BserUserStat[]> {
    try {
      const body = await this.request(
        `/v2/user/stats/uid/${encodeURIComponent(uid)}/${seasonId}/${BSER_MATCHING_MODE_RANKED}`,
      )
      return Array.isArray(body.userStats) ? (body.userStats as BserUserStat[]) : []
    } catch (e) {
      if (e instanceof BserApiError && e.status === 404) return []
      throw e
    }
  }

  /** 게임 데이터 Season 테이블 전체 — 프로세스 수명 동안 1회만 BSER 호출 */
  async getSeasonRows(): Promise<BserSeasonRow[]> {
    if (!seasonRowsPromise) {
      seasonRowsPromise = this.request('/v2/data/Season')
        .then((body) =>
          Array.isArray(body.data) ? (body.data as BserSeasonRow[]) : [],
        )
        .catch((e) => {
          seasonRowsPromise = null
          throw e
        })
    }
    return seasonRowsPromise
  }

  /** 게임 데이터의 Season 테이블에서 현재 시즌 API ID 조회 */
  async getCurrentSeasonId(): Promise<number | null> {
    const rows = await this.getSeasonRows()
    const current = rows.find((row) => row.isCurrent === 1)
    return current?.seasonID ?? null
  }

  /** l10n에서 캐릭터 코드 → 한국어 이름 — 메타+l10n 파일은 프로세스 수명 동안 1회만 */
  async getCharacterNames(language = 'Korean'): Promise<Map<number, string>> {
    let loading = characterNamesPromises.get(language)
    if (!loading) {
      loading = this.loadCharacterNames(language).catch((e) => {
        characterNamesPromises.delete(language)
        throw e
      })
      characterNamesPromises.set(language, loading)
    }
    return loading
  }

  private async loadCharacterNames(language: string): Promise<Map<number, string>> {
    const meta = await this.request(`/v1/l10n/${language}`)
    const data = meta.data as { l10Path?: string } | undefined
    const url = data?.l10Path
    const names = new Map<number, string>()
    if (!url) return names

    const res = await fetchWithTimeout(url, {}, resolveBserRequestTimeoutMs())
    if (!res.ok) {
      throw new BserApiError(res.status, 'Failed to download l10n data')
    }
    const text = await res.text()
    const prefix = 'Character/Name/'
    for (const line of text.split('\n')) {
      if (!line.startsWith(prefix)) continue
      const [key, value] = line.split('┃', 2)
      if (!key || value === undefined) continue
      const code = Number(key.slice(prefix.length))
      if (Number.isInteger(code) && code > 0) {
        names.set(code, value.trim())
      }
    }
    return names
  }
}
