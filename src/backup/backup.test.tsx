import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { fakeHouseholdApi } from '../test/fakeHousehold.ts'
import { renderApp } from '../test/renderApp.tsx'
import type { Backup } from './format.ts'

// Capture downloads instead of saving files.
let downloads: { name: string; blob: Blob }[] = []
beforeEach(() => {
  downloads = []
  let lastBlob: Blob | null = null
  URL.createObjectURL = vi.fn((blob: Blob) => ((lastBlob = blob), 'blob:test'))
  URL.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push({ name: this.download, blob: lastBlob! })
  })
})
afterEach(() => vi.restoreAllMocks())

async function exportJson(): Promise<Backup> {
  fireEvent.click(await screen.findByRole('button', { name: 'Export backup (JSON)' }))
  await screen.findByText('Backup saved')
  const file = downloads.at(-1)!
  expect(file.name).toMatch(/^prabas-backup-\d{4}-\d{2}-\d{2}\.json$/)
  return JSON.parse(await file.blob.text()) as Backup
}

async function importFile(content: string) {
  const input = screen.getByLabelText('Backup file')
  fireEvent.change(input, { target: { files: [new File([content], 'backup.json', { type: 'application/json' })] } })
}

describe('file backup', () => {
  test('round trip: export, change everything, import, and every table is back', async () => {
    const household = fakeHouseholdApi({ withHousehold: true })
    renderApp({ path: '/settings', household })
    const exported = await exportJson()
    expect(exported).toMatchObject({ app: 'PRABAS', schemaVersion: 1, householdId: 'hh-1' })
    const before = structuredClone(exported.tables)

    // "Wipe": both people's saved details change after the backup.
    await household.execute({
      kind: 'update',
      table: 'profiles',
      match: { user_id: 'user-1' },
      patch: { display_name: 'changed', script_pref: 'en_first', theme_pref: 'dark' },
      id: 'x',
      userId: 'user-1',
      createdAt: '',
      attempts: 0,
    })
    await household.execute({
      kind: 'update',
      table: 'profiles',
      match: { user_id: 'user-2' },
      patch: { display_name: 'changed too' },
      id: 'y',
      userId: 'user-1',
      createdAt: '',
      attempts: 0,
    })

    await importFile(JSON.stringify(exported))
    expect(await screen.findByText('Restore this backup?')).toBeTruthy()
    expect(screen.getByText(/replaces the household's data for everyone/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Replace data' }))
    expect(await screen.findByText('Backup restored')).toBeTruthy()

    const after = await household.backupApi.fetchTables()
    const pick = (rows: Record<string, unknown>[]) =>
      rows.map(({ user_id, display_name, script_pref, theme_pref }) => ({ user_id, display_name, script_pref, theme_pref }))
    expect(pick(after.profiles)).toEqual(pick(before.profiles))
    // The screen shows the restored data too.
    await waitFor(() => expect((screen.getByLabelText('Your name') as HTMLInputElement).value).toBe('raj'))
  })

  test('cancel leaves everything as it was', async () => {
    const household = fakeHouseholdApi({ withHousehold: true })
    renderApp({ path: '/settings', household })
    const exported = await exportJson()
    await importFile(JSON.stringify(exported))
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    expect(screen.queryByText('Restore this backup?')).toBeNull()
    expect(household.backupApi.restore).not.toHaveBeenCalled()
  })

  test('a file that is not a PRABAS backup is refused before any confirm', async () => {
    renderApp({ path: '/settings' })
    await screen.findByRole('button', { name: 'Restore from file' })
    await importFile(JSON.stringify({ app: 'MealFast', version: 1 }))
    expect(await screen.findByText('Not a PRABAS backup.')).toBeTruthy()
    expect(screen.queryByText('Restore this backup?')).toBeNull()
  })

  test('a backup from another household says so in the confirm', async () => {
    renderApp({ path: '/settings' })
    const exported = await exportJson()
    await importFile(JSON.stringify({ ...exported, householdId: 'somewhere-else' }))
    expect(await screen.findByText(/from a different household/)).toBeTruthy()
  })

  test('only the backup owner can restore; everyone can export', async () => {
    const household = fakeHouseholdApi({ withHousehold: true })
    household.setBackupOwner('user-2')
    renderApp({ path: '/settings', household })
    expect(await screen.findByText('Only the backup owner (Amma) can restore.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Restore from file' })).toBeNull()
    await exportJson()
  })

  test('CSV export is one file with a section per table', async () => {
    renderApp({ path: '/settings' })
    fireEvent.click(await screen.findByRole('button', { name: 'Export spreadsheet (CSV)' }))
    await screen.findByText('CSV saved')
    const file = downloads.at(-1)!
    expect(file.name).toMatch(/^prabas-\d{4}-\d{2}-\d{2}\.csv$/)
    const text = await file.blob.text()
    expect(text).toContain('People\nname,dish_names,joined\n')
    expect(text).toContain('raj,ta_first,')
  })

  test('offline export explains itself', async () => {
    const household = fakeHouseholdApi({ withHousehold: true })
    renderApp({ path: '/settings', household })
    await screen.findByRole('button', { name: 'Export backup (JSON)' })
    household.setOffline(true)
    fireEvent.click(screen.getByRole('button', { name: 'Export backup (JSON)' }))
    expect(await screen.findByText("You're offline. Try again when you're connected.")).toBeTruthy()
  })
})
