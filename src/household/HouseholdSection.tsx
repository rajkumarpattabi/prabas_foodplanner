import { useState } from 'react'
import { EditableText } from '../components/EditableText.tsx'
import { Section } from '../components/Section.tsx'
import { useToast } from '../components/toastContext.ts'
import { attribution } from '../lib/time.ts'
import { useReadyHousehold } from './householdContext.ts'
import { formatJoinCode } from './joinCode.ts'

const smallButton = 'min-h-11 rounded-xl border border-line px-4 text-sm font-medium disabled:opacity-60'

export function HouseholdSection() {
  const { me, household, members, renameHousehold, rotateJoinCode } = useReadyHousehold()
  const toast = useToast()
  const [rotating, setRotating] = useState(false)

  const names = new Map(members.map((m) => [m.userId, m.profile?.display_name || 'Someone']))
  const code = formatJoinCode(household.join_code)
  const backupOwner = household.backup_owner_id
    ? household.backup_owner_id === me.user_id
      ? 'You'
      : (names.get(household.backup_owner_id) ?? 'A former member')
    : 'Nobody yet'

  function rename(name: string) {
    const before = household.name
    renameHousehold(name)
    toast('Household renamed', { undo: () => renameHousehold(before) })
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code)
      toast('Code copied')
    } catch {
      toast("Couldn't copy. Read the code out instead.")
    }
  }

  async function shareCode() {
    const text = `Join our household in PRABAS: open the app, log in, choose "Join with a code", and enter ${code}`
    try {
      await navigator.share({ text })
    } catch {
      // Cancelled, or sharing unavailable: nothing to do.
    }
  }

  async function newCode() {
    setRotating(true)
    const err = await rotateJoinCode()
    setRotating(false)
    toast(err ?? 'New code made. The old one no longer works.')
  }

  return (
    <Section title="Household">
      <EditableText id="household-name" label="Name" value={household.name} maxLength={60} onCommit={rename} />
      <p className="mt-1 text-xs text-ink-muted">
        {attribution({ by: household.updated_by, at: household.updated_at, me: me.user_id, names })}
      </p>

      <h3 className="mt-4 text-sm text-ink-muted">Members</h3>
      <ul className="mt-1 divide-y divide-line">
        {members.map((m) => (
          <li key={m.userId} className="flex min-h-11 items-center gap-2 py-2">
            <span className="flex-1">
              {m.profile?.display_name || 'Someone'}
              {m.userId === me.user_id && <span className="text-ink-muted"> (you)</span>}
            </span>
            {m.userId === household.backup_owner_id && (
              <span className="rounded-full bg-blue-fill px-2 py-0.5 text-xs font-medium text-blue">Backup owner</span>
            )}
            {m.role === 'owner' && (
              <span className="rounded-full bg-leaf-fill px-2 py-0.5 text-xs font-medium text-leaf-strong">Started it</span>
            )}
          </li>
        ))}
      </ul>

      <h3 className="mt-4 text-sm text-ink-muted">Invite someone</h3>
      <p className="mt-1 text-sm">They log in, choose “Join with a code”, and enter:</p>
      <p aria-label="Join code" className="my-3 text-center font-mono text-3xl font-semibold tracking-[0.2em]">
        {code}
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void copyCode()} className={smallButton}>
          Copy
        </button>
        {'share' in navigator && (
          <button type="button" onClick={() => void shareCode()} className={smallButton}>
            Share
          </button>
        )}
        <button type="button" onClick={() => void newCode()} disabled={rotating} className={smallButton}>
          {rotating ? 'Making…' : 'New code'}
        </button>
      </div>

      <p className="mt-4 text-sm">
        <span className="text-ink-muted">Backup owner: </span>
        {backupOwner}
      </p>
    </Section>
  )
}
