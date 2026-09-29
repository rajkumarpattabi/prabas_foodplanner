import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { nextSunChange } from './sunset.ts'
import { resolveTheme, THEME_COLOR, THEME_PREFS, type ThemePref } from './theme.ts'
import { ThemeContext } from './themeContext.ts'

// Device-local copy of the preference, so the right theme shows before the profile loads.
const PREF_KEY = 'prabas_theme_pref'
// The last resolved theme, read by the inline script in index.html to avoid a flash on open.
const LAST_KEY = 'prabas_theme_last'

function readPref(): ThemePref {
  const saved = localStorage.getItem(PREF_KEY)
  return THEME_PREFS.includes(saved as ThemePref) ? (saved as ThemePref) : 'auto'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>(readPref)
  const [now, setNow] = useState(() => new Date())

  // In auto mode, wake at the next sunrise or sunset. Phones pause timers while the
  // app is in the background, so also re-check whenever the app becomes visible.
  useEffect(() => {
    if (pref !== 'auto') return
    const wait = Math.max(1000, nextSunChange(now).getTime() - Date.now() + 1000)
    const timer = setTimeout(() => setNow(new Date()), wait)
    const onVisible = () => {
      if (document.visibilityState === 'visible') setNow(new Date())
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [pref, now])

  const theme = resolveTheme(pref, now)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme])
    localStorage.setItem(LAST_KEY, theme)
  }, [theme])

  const setPref = useCallback((next: ThemePref) => {
    localStorage.setItem(PREF_KEY, next)
    setPrefState(next)
    setNow(new Date())
  }, [])

  const value = useMemo(() => ({ pref, theme, setPref }), [pref, theme, setPref])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
