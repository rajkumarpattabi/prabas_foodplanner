import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { fakeDrive } from '../../test/fakeDrive.ts'
import { fakeHouseholdApi } from '../../test/fakeHousehold.ts'
import { renderApp } from '../../test/renderApp.tsx'
import { buildBackup } from '../format.ts'
import { GD } from './driveBackup.ts'

const HOUR = 3_600_000
const connectedAt = (msAgo: number) => {
  localStorage.setItem(GD.connected, '1')
  localStorage.setItem(GD.last, new Date(Date.now() - msAgo).toISOString())
}

describe('Drive backup in Settings', () => {
  test('connect: backs up at once, shows the time, and tells the household', async () => {
    const drive = fakeDrive()
    const household = fakeHouseholdApi({ withHousehold: true })
    renderApp({ path: '/settings', household, drive: drive.deps })

    fireEvent.click(await screen.findByRole('button', { name: 'Connect Google Drive' }))
    expect(await screen.findByText('Backed up to Drive')).toBeTruthy()
    expect(screen.getByText('Last synced: just now')).toBeTruthy()
    expect(drive.names()).toHaveLength(1)
    await waitFor(() => expect(household.server.household()?.drive_backup_at).toBeTruthy())
  })

  test('sign-in trouble shows a readable line and keeps Connect available', async () => {
    const drive = fakeDrive()
    drive.setSignInFails(true)
    renderApp({ path: '/settings', drive: drive.deps })
    fireEvent.click(await screen.findByRole('button', { name: 'Connect Google Drive' }))
    expect(await screen.findByText('Sign-in needed to sync')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Connect Google Drive' })).toBeTruthy()
  })

  test('restore from Drive: pick a date (newest first), confirm, and it is restored', async () => {
    const drive = fakeDrive()
    const household = fakeHouseholdApi({ withHousehold: true })
    const older = buildBackup('hh-1', { profiles: [{ user_id: 'user-1', display_name: 'Older name' }] })
    const newer = buildBackup('hh-1', { profiles: [{ user_id: 'user-1', display_name: 'Newer name' }] })
    drive.seed('prabas-backup-2026-09-20.json', JSON.stringify(older))
    drive.seed('prabas-backup-2026-09-27.json', JSON.stringify(newer))
    connectedAt(HOUR)
    renderApp({ path: '/settings', household, drive: drive.deps })

    fireEvent.click(await screen.findByRole('button', { name: 'Restore from Drive' }))
    const dialog = await screen.findByRole('dialog', { name: 'Restore from Drive' })
    const choices = dialog.querySelectorAll('li button')
    // Newest first, with the newest marked (exact date format varies by browser).
    const labels = [...choices].map((b) => b.textContent ?? '')
    expect(labels).toHaveLength(2)
    expect(labels[0]).toMatch(/27.*Sep.*2026.*Latest$/)
    expect(labels[1]).toMatch(/20.*Sep.*2026$/)

    fireEvent.click(choices[1])
    expect(await screen.findByText('Restore this backup?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Replace data' }))
    expect(await screen.findByText('Restored from Drive')).toBeTruthy()
    expect(household.server.profile('user-1')?.display_name).toBe('Older name')
  })

  test('disconnect revokes access and shows Connect again', async () => {
    const drive = fakeDrive()
    connectedAt(HOUR)
    renderApp({ path: '/settings', drive: drive.deps })
    fireEvent.click(await screen.findByRole('button', { name: 'Disconnect Drive' }))
    expect(await screen.findByRole('button', { name: 'Connect Google Drive' })).toBeTruthy()
    expect(drive.tokens.revoke).toHaveBeenCalledOnce()
  })

  test('other members see when it last ran, but no controls', async () => {
    const household = fakeHouseholdApi({ withHousehold: true })
    household.setBackupOwner('user-2')
    renderApp({ path: '/settings', household })
    expect(await screen.findByText('Not backed up to Drive yet')).toBeTruthy()
    expect(screen.getByText("Drive backup runs from Amma's phone.")).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Connect Google Drive' })).toBeNull()
  })

  test('a build without a Google client id says so', async () => {
    renderApp({ path: '/settings', drive: null })
    expect(await screen.findByText("Drive backup isn't set up in this build yet.")).toBeTruthy()
  })
})

describe('automatic backup on open', () => {
  test('backs up quietly when the last backup is over 24 hours old', async () => {
    const drive = fakeDrive()
    connectedAt(25 * HOUR)
    renderApp({ drive: drive.deps })
    await waitFor(() => expect(drive.names()).toHaveLength(1))
    expect(screen.queryByText('Backed up to Drive')).toBeNull() // no toast
  })

  test('does nothing when the last backup is recent', async () => {
    const drive = fakeDrive()
    connectedAt(2 * HOUR)
    renderApp({ drive: drive.deps })
    await screen.findByRole('heading', { name: 'Plan' })
    await new Promise((r) => setTimeout(r, 50))
    expect(drive.files.save).not.toHaveBeenCalled()
  })

  test("doesn't run on a phone that isn't the backup owner's", async () => {
    const drive = fakeDrive()
    const household = fakeHouseholdApi({ withHousehold: true })
    household.setBackupOwner('user-2')
    connectedAt(48 * HOUR)
    renderApp({ household, drive: drive.deps })
    await screen.findByRole('heading', { name: 'Plan' })
    await new Promise((r) => setTimeout(r, 50))
    expect(drive.files.save).not.toHaveBeenCalled()
  })
})
