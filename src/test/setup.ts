import '@testing-library/jest-dom/vitest'
import { beforeEach, vi } from 'vitest'

type MatchMediaListener = (event: MediaQueryListEvent) => void

export interface MatchMediaMockOptions {
  matches?: boolean
}

function createMatchMediaList(query: string, options: MatchMediaMockOptions = {}): MediaQueryList {
  const listeners = new Set<MatchMediaListener>()
  const legacyListeners = new Set<(this: MediaQueryList, ev: MediaQueryListEvent) => void>()

  return {
    media: query,
    matches: options.matches ?? false,
    onchange: null,
    addEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      if (type === 'change' && typeof listener === 'function') {
        listeners.add(listener as MatchMediaListener)
      }
    }),
    removeEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      if (type === 'change' && typeof listener === 'function') {
        listeners.delete(listener as MatchMediaListener)
      }
    }),
    addListener: vi.fn((listener: (this: MediaQueryList, ev: MediaQueryListEvent) => void) => {
      legacyListeners.add(listener)
    }),
    removeListener: vi.fn((listener: (this: MediaQueryList, ev: MediaQueryListEvent) => void) => {
      legacyListeners.delete(listener)
    }),
    dispatchEvent: vi.fn(() => true),
  } as MediaQueryList
}

let defaultMatches = false

/** 테스트별 prefers-* media query 기본 matches 오버라이드 */
export function setMatchMediaMatches(matches: boolean): void {
  defaultMatches = matches
}

export function resetMatchMediaMatches(): void {
  defaultMatches = false
}

/** 쿼리별 matches를 지정할 때 사용 */
export function mockMatchMedia(
  resolver: (query: string) => MatchMediaMockOptions,
): void {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn((query: string) => createMatchMediaList(query, resolver(query))),
  })
}

beforeEach(() => {
  defaultMatches = false
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn((query: string) => createMatchMediaList(query, { matches: defaultMatches })),
  })
})
