import { useEffect, useId, useState } from 'react'
import { Section } from '../components/Section.tsx'
import { useToast } from '../components/toastContext.ts'
import { inputClass } from '../stock/labels.ts'
import { usePushDeps } from './push.ts'
import { useReminders } from './reminderContext.ts'
import { REMINDER_TYPE_LABELS, REMINDER_TYPES, type ReminderType } from './types.ts'

type Device = 'checking' | 'on' | 'off'

/** Settings → Reminders: this phone on or off, which kinds, the evening time and quiet hours. */
export function RemindersSection() {
  const push = usePushDeps()
  const { settings, saveSettings } = useReminders()
  const toast = useToast()
  const [device, setDevice] = useState<Device>('checking')
  const [busy, setBusy] = useState(false)
  const support = push?.support() ?? 'not-set-up'

  useEffect(() => {
    if (!push || support !== 'ok') return
    let live = true
    push.current().then(
      (keys) => live && setDevice(keys ? 'on' : 'off'),
      () => live && setDevice('off'),
    )
    return () => {
      live = false
    }
  }, [push, support])

  const turnOn = async () => {
    if (!push) return
    setBusy(true)
    try {
      const keys = await push.subscribe()
      await push.register(keys, push.label())
      setDevice('on')
      // Saved settings are what the server reads; save the defaults the first time.
      if (!settings.saved) saveSettings({})
      toast('Reminders on for this phone')
    } catch (e) {
      toast(push.permission() === 'denied' ? 'Notifications are blocked for PRABAS in this phone’s settings.' : `Couldn’t turn reminders on. ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const turnOff = async () => {
    if (!push) return
    setBusy(true)
    try {
      const endpoint = await push.unsubscribe()
      if (endpoint) await push.forget(endpoint)
      setDevice('off')
      toast('Reminders off for this phone')
    } catch (e) {
      toast(`Couldn’t turn reminders off. ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const test = async () => {
    if (!push) return
    setBusy(true)
    try {
      const sent = await push.sendTest()
      toast(sent ? 'Test sent. It should arrive in a moment.' : 'No phones to send to yet.')
    } catch (e) {
      toast(`Couldn’t send a test. ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const toggle = (t: ReminderType, on: boolean) =>
    saveSettings({ types: REMINDER_TYPES.filter((x) => (x === t ? on : settings.types.includes(x))) })

  return (
    <Section title="Reminders">
      {support === 'not-set-up' && <p className="text-sm text-ink-muted">Reminders aren’t set up for this version of the app yet.</p>}
      {support === 'unsupported' && <p className="text-sm text-ink-muted">This browser can’t show reminders. Try PRABAS on your phone.</p>}
      {support === 'install-first' && (
        <div role="note" className="rounded-xl bg-turmeric-fill p-3 text-sm text-turmeric-strong">
          <p className="font-medium">On iPhone, reminders need PRABAS on your Home Screen</p>
          <p className="mt-1">It needs iOS 16.4 or later. In Safari, tap Share, then Add to Home Screen. Open PRABAS from there and turn reminders on.</p>
        </div>
      )}
      {support === 'ok' && (
        <>
          <p className="text-sm">
            {device === 'checking' ? 'Checking this phone…' : device === 'on' ? 'On for this phone' : 'Off for this phone'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {device === 'off' && (
              <button type="button" disabled={busy} onClick={() => void turnOn()} className="min-h-11 rounded-xl bg-leaf px-4 font-semibold text-bg disabled:opacity-50">
                Turn on reminders
              </button>
            )}
            {device === 'on' && (
              <>
                <button type="button" disabled={busy} onClick={() => void test()} className="min-h-11 rounded-xl border border-line px-4 text-sm font-medium disabled:opacity-50">
                  Send a test
                </button>
                <button type="button" disabled={busy} onClick={() => void turnOff()} className="min-h-11 rounded-xl px-4 text-sm font-medium text-ink-muted disabled:opacity-50">
                  Turn off for this phone
                </button>
              </>
            )}
          </div>
          <p className="mt-2 text-xs text-ink-muted">Each phone is turned on by itself. Reminders arrive even when the app is closed.</p>
        </>
      )}

      <div className="mt-4 divide-y divide-line rounded-xl border border-line" role="group" aria-label="Which reminders">
        {REMINDER_TYPES.map((t) => (
          <label key={t} className="flex min-h-12 items-center justify-between gap-3 px-3">
            <span className="font-medium">{REMINDER_TYPE_LABELS[t]}</span>
            <input type="checkbox" role="switch" checked={settings.types.includes(t)} onChange={(e) => toggle(t, e.target.checked)} className="h-6 w-6 accent-leaf" />
          </label>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <TimeField label="Evening time" value={settings.evening_time} onChange={(evening_time) => saveSettings({ evening_time })} />
        <TimeField label="Quiet from" value={settings.quiet_from} onChange={(quiet_from) => saveSettings({ quiet_from })} />
        <TimeField label="Quiet until" value={settings.quiet_to} onChange={(quiet_to) => saveSettings({ quiet_to })} />
      </div>
      <p className="mt-2 text-xs text-ink-muted">The night-before ones come at your evening time. Nothing comes in quiet hours; it waits until they end.</p>
    </Section>
  )
}

function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="text-xs font-medium">
        {label}
      </label>
      <input id={id} type="time" value={value} onChange={(e) => e.target.value && onChange(e.target.value)} className={`mt-1 ${inputClass} px-2`} />
    </div>
  )
}
