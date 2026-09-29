import { Link } from 'react-router'
import { useAuth } from '../auth/authContext.ts'
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
  const { session, signOut } = useAuth()
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

      <Section title="Account">
        <p className="text-sm">
          Logged in as <span className="font-medium">{session?.user.email}</span>
        </p>
        <button
          type="button"
          onClick={() => void signOut()}
          className="mt-3 min-h-11 rounded-xl border border-line px-4 text-sm font-medium"
        >
          Log out
        </button>
      </Section>
    </Screen>
  )
}
