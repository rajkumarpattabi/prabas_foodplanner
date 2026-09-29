import { Link } from 'react-router'
import { useAuth } from '../auth/authContext.ts'
import { BackupSection } from '../backup/BackupSection.tsx'
import { EditableText } from '../components/EditableText.tsx'
import { BackIcon } from '../components/icons.tsx'
import { Screen } from '../components/Screen.tsx'
import { Section } from '../components/Section.tsx'
import { Segmented } from '../components/Segmented.tsx'
import { HouseholdSection } from '../household/HouseholdSection.tsx'
import { useReadyHousehold } from '../household/householdContext.ts'
import type { ScriptPref } from '../lib/database.types.ts'
import type { ThemePref } from '../theme/theme.ts'
import { useTheme } from '../theme/themeContext.ts'

const THEME_OPTIONS: { value: ThemePref; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

const SCRIPT_OPTIONS: { value: ScriptPref; label: string }[] = [
  { value: 'ta_first', label: 'தமிழ் first' },
  { value: 'en_first', label: 'English first' },
]

export function SettingsScreen() {
  const { pref, setPref } = useTheme()
  const { session, signOut } = useAuth()
  const { me, updateProfile } = useReadyHousehold()

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
      <HouseholdSection />

      <Section title="You">
        <EditableText
          id="display-name"
          label="Your name"
          value={me.display_name}
          maxLength={40}
          onCommit={(display_name) => updateProfile({ display_name })}
        />
        <p className="mt-4 mb-1 text-sm text-ink-muted">Dish names</p>
        <Segmented
          label="Dish names"
          options={SCRIPT_OPTIONS}
          value={me.script_pref}
          onChange={(script_pref) => updateProfile({ script_pref })}
        />
      </Section>

      <Section title="Appearance">
        <Segmented
          label="Theme"
          options={THEME_OPTIONS}
          value={pref}
          onChange={(theme_pref) => {
            setPref(theme_pref)
            updateProfile({ theme_pref })
          }}
        />
        <p className="mt-2 text-sm text-ink-muted">Auto switches to dark after sunset in Chennai.</p>
      </Section>

      <BackupSection />

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
