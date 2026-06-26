import { describe, expect, it, vi, beforeEach } from "vitest"

import {
  coordinateProfileEntryFreshness,
  resetProfileEntryFreshnessForTests,
} from "./profileEntryFreshness.js"
import { resetProfileEntryPeekCacheForTests } from "./profileEntryPeekCache.js"
import { resetRecentMatchFreshnessInflightForTests } from "./recentMatchFreshness.js"

function buildDeps(overrides = {}) {
  const collectRecentMatches = vi.fn(async () => ({
    newMatchCount: 0,
    pagesFetched: 0,
    detailFetchCount: 0,
  }))
  const applyNewMatches = vi.fn(async () => {})
  const finalizeAfterCollect = vi.fn(async (params) => ({
    rankUpdated: false,
    latestGameIdBefore: params.latestGameIdBefore,
    latestGameIdAfter: params.latestGameIdBefore,
    gamesFetched: params.gamesFetched,
    newGamesInserted: params.newGamesInserted,
    matchesUpdated: params.newGamesInserted > 0,
    statsInvalidated: false,
    aggregateInvalidated: false,
    snapshotInvalidatedOrRebuilt: false,
    refreshCompletedAt: new Date().toISOString(),
  }))
  return {
    prisma: {} as never,
    logger: { info: vi.fn(), warn: vi.fn() } as never,
    nickname: "test",
    canonicalUid: "uid-1",
    hasProfileCache: true,
    explicitRefresh: false,
    playerMatchUids: ["uid-1"],
    peekUpstreamLatestGameId: vi.fn(async () => "200"),
    collectRecentMatches,
    applyNewMatches,
    finalizeAfterCollect,
    ...overrides,
  }
}

describe("profileEntryFreshness", () => {
  beforeEach(() => {
    resetProfileEntryFreshnessForTests()
    resetProfileEntryPeekCacheForTests()
    resetRecentMatchFreshnessInflightForTests()
  })

  it("skips collect when db and upstream game ids match", async () => {
    const deps = buildDeps({
      peekUpstreamLatestGameId: vi.fn(async () => "100"),
      collectRecentMatches: vi.fn(async () => ({
        newMatchCount: 1,
        pagesFetched: 1,
        detailFetchCount: 0,
      })),
    })
    vi.spyOn(await import("./profileRefreshState.js"), "readProfileLatestGameId").mockResolvedValue("100")
    vi.spyOn(await import("./profileRefreshState.js"), "recordRecentMatchCheckSuccess").mockResolvedValue()

    const result = await coordinateProfileEntryFreshness(deps)
    expect(result.status).toBe("already-fresh")
    expect(deps.collectRecentMatches).not.toHaveBeenCalled()
  })

  it("collects only when upstream has newer game id", async () => {
    const deps = buildDeps({
      peekUpstreamLatestGameId: vi.fn(async () => "200"),
      collectRecentMatches: vi.fn(async () => ({
        newMatchCount: 1,
        pagesFetched: 1,
        detailFetchCount: 0,
      })),
      finalizeAfterCollect: vi.fn(async () => ({
        rankUpdated: false,
        latestGameIdBefore: "100",
        latestGameIdAfter: "200",
        gamesFetched: 1,
        newGamesInserted: 1,
        matchesUpdated: true,
        statsInvalidated: true,
        aggregateInvalidated: true,
        snapshotInvalidatedOrRebuilt: true,
        refreshCompletedAt: new Date().toISOString(),
      })),
    })
    vi.spyOn(await import("./profileRefreshState.js"), "readProfileLatestGameId").mockResolvedValue("100")

    const result = await coordinateProfileEntryFreshness(deps)
    expect(result.status).toBe("collected")
    expect(deps.collectRecentMatches).toHaveBeenCalledTimes(1)
  })

  it("dedupes concurrent entry freshness for same uid", async () => {
    let peekCount = 0
    const deps = buildDeps({
      peekUpstreamLatestGameId: vi.fn(async () => {
        peekCount += 1
        await new Promise((r) => setTimeout(r, 20))
        return "100"
      }),
    })
    vi.spyOn(await import("./profileRefreshState.js"), "readProfileLatestGameId").mockResolvedValue("100")
    vi.spyOn(await import("./profileRefreshState.js"), "recordRecentMatchCheckSuccess").mockResolvedValue()

    const [a, b] = await Promise.all([
      coordinateProfileEntryFreshness(deps),
      coordinateProfileEntryFreshness(deps),
    ])
    expect(a.status).toBe("already-fresh")
    expect(b.status).toBe("already-fresh")
    expect(peekCount).toBe(1)
  })
})
