import { useCallback, useLayoutEffect, useSyncExternalStore } from 'react'

const STORAGE_KEY = 'bowls-theme'

function getStoredTheme() {
  try {
    const s = localStorage.getItem(STORAGE_KEY)
    return s === 'light' || s === 'dark' ? s : 'dark'
  } catch {
    return 'dark'
  }
}

function subscribe(onChange) {
  window.addEventListener('storage', onChange)
  window.addEventListener('bowls-theme-change', onChange)
  return () => {
    window.removeEventListener('storage', onChange)
    window.removeEventListener('bowls-theme-change', onChange)
  }
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getStoredTheme, () => 'dark')

  const setTheme = useCallback((next) => {
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* ignore */
    }
    document.documentElement.dataset.bowlsTheme = next
    window.dispatchEvent(new Event('bowls-theme-change'))
  }, [])

  useLayoutEffect(() => {
    document.documentElement.dataset.bowlsTheme = theme
  }, [theme])

  return [theme, setTheme]
}
