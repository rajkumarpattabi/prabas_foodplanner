import { Link } from 'react-router'
import { SettingsIcon } from '../components/icons.tsx'
import { Placeholder, Screen } from '../components/Screen.tsx'

export function PlanScreen() {
  return (
    <Screen
      title="Plan"
      actions={
        <Link
          to="/settings"
          aria-label="Settings"
          className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-ink-muted"
        >
          <SettingsIcon />
        </Link>
      }
    >
      <Placeholder>Meal suggestions for your next meal will show here.</Placeholder>
    </Screen>
  )
}
