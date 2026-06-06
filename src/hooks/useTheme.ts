import { useCallback, useEffect, useState } from 'react'

import {
  applyTheme,
  getInitialTheme,
  persistTheme,
  readStoredTheme,
  type ThemeSetting,
} from '@/lib/theme'

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeSetting>(getInitialTheme)

  const setTheme = useCallback((next: ThemeSetting) => {
    setThemeState(next)
    applyTheme(next)
    persistTheme(next)
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }, [setTheme, theme])

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  useEffect(() => {
    if (readStoredTheme() !== null) return

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      const next: ThemeSetting = media.matches ? 'dark' : 'light'
      setThemeState(next)
      applyTheme(next)
    }

    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  return {
    theme,
    resolvedTheme: theme,
    setTheme,
    toggleTheme,
  }
}
