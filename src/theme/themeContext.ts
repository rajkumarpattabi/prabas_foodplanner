import { createContext, useContext } from 'react'
import type { Theme, ThemePref } from './theme.ts'

export interface ThemeState {
  pref: ThemePref
  theme: Theme
  setPref: (pref: ThemePref) => void
}

export const ThemeContext = createContext<ThemeState | null>(null)

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider')
  return ctx
}
