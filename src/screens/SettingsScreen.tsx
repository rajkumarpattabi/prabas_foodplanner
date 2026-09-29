import { Link } from 'react-router'
import { BackIcon } from '../components/icons.tsx'
import { Screen } from '../components/Screen.tsx'
import { Section } from '../components/Section.tsx'
import { Segmented } from '../components/Segmented.tsx'
import type { ThemePref } from '../theme/theme.ts'
import { useTheme } from '../theme/themeContext.ts'

const THEME_OPTIONS: { value: ThemePref; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

export function SettingsScreen() {
  const { pref, setPref } = useTheme()
  return (
    <Screen
      title="Settings"
      leading={
        <Link
          to="/plan"
          aria-label="Back to plan"
          className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-ink-muted"
        >
          <BackIcon />
        </Link>
      }
    >
      <Section title="Appearance">
        <Segmented label="Theme" options={THEME_OPTIONS} value={pref} onChange={setPref} />
        <p className="mt-2 text-sm text-ink-muted">Auto switches to dark after sunset in Chennai.</p>
      </Section>
    </Screen>
  )
}
