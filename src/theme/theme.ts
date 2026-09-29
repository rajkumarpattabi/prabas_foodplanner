import { isAfterDark, type GeoPoint, HOME } from './sunset.ts'

export type ThemePref = 'auto' | 'light' | 'dark'
export type Theme = 'light' | 'dark'

export const THEME_PREFS: readonly ThemePref[] = ['auto', 'light', 'dark']

/** The theme to show right now for a preference. "auto" is dark between sunset and sunrise. */
export function resolveTheme(pref: ThemePref, now: Date, at: GeoPoint = HOME): Theme {
  if (pref === 'auto') return isAfterDark(now, at) ? 'dark' : 'light'
  return pref
}

/** Browser chrome colour (status bar, Android task switcher) for each theme. */
export const THEME_COLOR: Record<Theme, string> = {
  light: '#fbf8f1',
  dark: '#1b1a17',
}
