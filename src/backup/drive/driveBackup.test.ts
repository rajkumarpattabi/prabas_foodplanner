import { describe, expect, test, vi } from 'vitest'
import { fakeDrive } from '../../test/fakeDrive.ts'
import { buildBackup } from '../format.ts'
import {
  backupToDrive,
  disconnectDrive,
  ERR_FAILED,
  ERR_SIGN_IN,
  GD,
  isBackupDue,
  listDriveBackups,
  readStatus,
} from './driveBackup.ts'
import { DriveError, driveFiles } from './driveFiles.ts'

const make = () => Promise.resolve(buildBackup('hh-1', { profiles: [{ user_id: 'u1' }] }))
const day = (d: number, hour = 21) => new Date(2026, 8, d, hour)

describe('backupToDrive', () => {
  test('first backup: creates the folder and today\'s file, and records success', async () => {
    const drive = fakeDrive()
    const status = await backupToDrive(drive.deps, make, day(29))
    expect(drive.names()).toEqual(['prabas-backup-2026-09-29.json'])
    expect(JSON.parse(drive.body('prabas-backup-2026-09-29.json')!)).toMatchObject({ app: 'PRABAS', householdId: 'hh-1' })
    expect(status).toEqual({ connected: true, last: day(29).toISOString(), err: null })
    expect(localStorage.getItem(GD.folderId)).toMatch(/^folder-/)
  })

  test('twice in one day replaces that day\'s file instead of adding one', async () => {
    const drive = fakeDrive()
    await backupToDrive(drive.deps, make, day(29, 8))
    await backupToDrive(drive.deps, make, day(29, 21))
    expect(drive.names()).toEqual(['prabas-backup-2026-09-29.json'])
  })

  test('prunes by the retention rule after saving', async () => {
    const drive = fakeDrive()
    for (let d = 1; d <= 28; d++) drive.seed(`prabas-backup-2026-09-${String(d).padStart(2, '0')}.json`, '{}')
    await backupToDrive(drive.deps, make, day(29))
    expect(drive.names()).toEqual([
      'prabas-backup-2026-09-06.json', // weekly: 31 Aug–6 Sep
      'prabas-backup-2026-09-13.json', // weekly
      'prabas-backup-2026-09-20.json', // weekly
      'prabas-backup-2026-09-23.json', // daily ×7 from here
      'prabas-backup-2026-09-24.json',
      'prabas-backup-2026-09-25.json',
      'prabas-backup-2026-09-26.json',
      'prabas-backup-2026-09-27.json',
      'prabas-backup-2026-09-28.json',
      'prabas-backup-2026-09-29.json',
    ])
  })

  test('a stale folder id (folder deleted in Drive) finds or makes the folder again', async () => {
    const drive = fakeDrive()
    await backupToDrive(drive.deps, make, day(28))
    const oldFolder = localStorage.getItem(GD.folderId)
    drive.deleteFolder()
    await backupToDrive(drive.deps, make, day(29))
    expect(localStorage.getItem(GD.folderId)).not.toBe(oldFolder)
    expect(readStatus().err).toBeNull()
  })

  test('failures keep the last good time and say what to do', async () => {
    const drive = fakeDrive()
    await backupToDrive(drive.deps, make, day(28))

    drive.setDown(true)
    expect(await backupToDrive(drive.deps, make, day(29))).toEqual({
      connected: true,
      last: day(28).toISOString(),
      err: ERR_FAILED,
    })

    drive.setDown(false)
    drive.setSignInFails(true)
    expect((await backupToDrive(drive.deps, make, day(29))).err).toBe(ERR_SIGN_IN)
    expect(readStatus().last).toBe(day(28).toISOString())

    drive.setSignInFails(false)
    expect((await backupToDrive(drive.deps, make, day(29))).err).toBeNull()
  })

  test('an expired token is refreshed once and the backup goes through', async () => {
    const drive = fakeDrive()
    const ensure = drive.files.ensureFolder as ReturnType<typeof vi.fn>
    ensure.mockRejectedValueOnce(new DriveError('expired', 401))
    const status = await backupToDrive(drive.deps, make, day(29))
    expect(drive.tokens.forget).toHaveBeenCalledOnce()
    expect(status.err).toBeNull()
    expect(drive.names()).toEqual(['prabas-backup-2026-09-29.json'])
  })
})

describe('auto-backup timing', () => {
  test('due only when connected and the last backup is 24 hours old', () => {
    const now = day(29).getTime()
    expect(isBackupDue({ connected: false, last: null, err: null }, now)).toBe(false)
    expect(isBackupDue({ connected: true, last: null, err: null }, now)).toBe(true)
    expect(isBackupDue({ connected: true, last: new Date(now - 23 * 3_600_000).toISOString(), err: null }, now)).toBe(false)
    expect(isBackupDue({ connected: true, last: new Date(now - 24 * 3_600_000).toISOString(), err: null }, now)).toBe(true)
  })
})

describe('listing and disconnecting', () => {
  test('lists backups newest first, ignoring other files', async () => {
    const drive = fakeDrive()
    drive.seed('prabas-backup-2026-09-20.json', '{}')
    drive.seed('prabas-backup-2026-09-28.json', '{}')
    drive.seed('prabas-backup-notes.json', '{}')
    const names = (await listDriveBackups(drive.deps)).map((f) => f.name)
    expect(names).toEqual(['prabas-backup-2026-09-28.json', 'prabas-backup-2026-09-20.json'])
  })

  test('disconnect revokes access, then clears the local flags', async () => {
    const drive = fakeDrive()
    await backupToDrive(drive.deps, make, day(29))
    await disconnectDrive(drive.deps)
    expect(drive.tokens.revoke).toHaveBeenCalledOnce()
    expect(Object.values(GD).map((k) => localStorage.getItem(k))).toEqual([null, null, null, null])
  })
})

describe('Drive REST client', () => {
  function fetchMock(routes: [RegExp, (init: RequestInit) => Response][]) {
    const calls: { url: string; init: RequestInit }[] = []
    const fn = vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, init })
      const route = routes.find(([re]) => re.test(`${init.method ?? 'GET'} ${url}`))
      return route ? route[1](init) : new Response('nope', { status: 500 })
    })
    return { fn: fn as unknown as typeof fetch, calls }
  }
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

  test('stale cached folder: checks it, searches by name, then creates the folder', async () => {
    const { fn, calls } = fetchMock([
      [/^GET .*\/files\/old-id\?fields/, () => json({ error: 'gone' }, 404)],
      [/^GET .*\/files\?q=/, () => json({ files: [] })],
      [/^POST .*\/drive\/v3\/files\?fields=id/, () => json({ id: 'new-folder' })],
    ])
    expect(await driveFiles(fn).ensureFolder('t', 'old-id')).toBe('new-folder')
    expect(calls.map((c) => c.init.method ?? 'GET')).toEqual(['GET', 'GET', 'POST'])
    expect(decodeURIComponent(calls[1].url)).toContain("name='PRABAS backups'")
    expect(JSON.parse(String(calls[2].init.body))).toEqual({
      name: 'PRABAS backups',
      mimeType: 'application/vnd.google-apps.folder',
    })
    expect(calls.every((c) => (c.init.headers as Record<string, string>).Authorization === 'Bearer t')).toBe(true)
  })

  test('new file: multipart upload into the folder; existing file: replaced in place', async () => {
    const { fn, calls } = fetchMock([
      [/^POST .*upload.*uploadType=multipart/, () => json({ id: 'f1' })],
      [/^PATCH .*upload.*\/f1\?uploadType=media/, () => json({ id: 'f1' })],
    ])
    const files = driveFiles(fn)
    await files.save('t', 'folder-1', 'prabas-backup-2026-09-29.json', '{"a":1}', [])
    const body = String(calls[0].init.body)
    expect(body).toContain('"parents":["folder-1"]')
    expect(body).toContain('{"a":1}')

    await files.save('t', 'folder-1', 'prabas-backup-2026-09-29.json', '{"a":2}', [
      { id: 'f1', name: 'prabas-backup-2026-09-29.json' },
    ])
    expect(calls[1].init.method).toBe('PATCH')
    expect(calls[1].init.body).toBe('{"a":2}')
  })
})
