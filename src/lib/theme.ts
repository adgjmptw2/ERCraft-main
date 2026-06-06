export const THEME_STORAGE_KEY = 'ercraft-theme'

export type ThemeSetting = 'light' | 'dark'

export function getSystemTheme(): ThemeSetting {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function readStoredTheme(): ThemeSetting | null {
  if (typeof window === 'undefined') return null
  const value = localStorage.getItem(THEME_STORAGE_KEY)
  if (value === 'light' || value === 'dark') return value
  return null
}

export function resolveTheme(stored: ThemeSetting | null): ThemeSetting {
  return stored ?? getSystemTheme()
}

export function applyTheme(theme: ThemeSetting): void {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('dark', theme === 'dark')
}

export function persistTheme(theme: ThemeSetting): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(THEME_STORAGE_KEY, theme)
}

export function initTheme(): ThemeSetting {
  const theme = resolveTheme(readStoredTheme())
  applyTheme(theme)
  return theme
}

export function getInitialTheme(): ThemeSetting {
  return resolveTheme(readStoredTheme())
}
