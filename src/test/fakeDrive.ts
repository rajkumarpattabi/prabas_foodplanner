import { vi } from 'vitest'
import type { DriveDeps } from '../backup/drive/driveBackup.ts'
import { DriveError, FOLDER_NAME, type BackupFileInfo, type DriveFiles } from '../backup/drive/driveFiles.ts'
import { GoogleAuthError } from '../backup/drive/google.ts'

interface StoredFile extends BackupFileInfo {
  parent: string
  body: string
}

/** An in-memory Google Drive and sign-in, for tests. */
export function fakeDrive() {
  const state = { signInFails: false, down: false, nextId: 1 }
  const folders = new Map<string, string>() // id → name
  const stored = new Map<string, StoredFile>()
  const id = (prefix: string) => `${prefix}-${state.nextId++}`
  const check = () => {
    if (state.down) throw new DriveError('Drive down', 503)
  }

  const tokens = {
    getToken: vi.fn(async () => {
      if (state.signInFails) throw new GoogleAuthError('popup_failed_to_open')
      return 'token'
    }),
    revoke: vi.fn(async () => {}),
    forget: vi.fn(),
  }

  const files: DriveFiles = {
    ensureFolder: vi.fn(async (_t: string, cachedId: string | null) => {
      check()
      if (cachedId && folders.has(cachedId)) return cachedId
      const found = [...folders].find(([, name]) => name === FOLDER_NAME)?.[0]
      if (found) return found
      const fid = id('folder')
      folders.set(fid, FOLDER_NAME)
      return fid
    }),
    list: vi.fn(async (_t: string, folderId: string) => {
      check()
      return [...stored.values()]
        .filter((f) => f.parent === folderId)
        .map(({ id, name, modifiedTime }) => ({ id, name, modifiedTime }))
    }),
    save: vi.fn(async (_t: string, folderId: string, name: string, body: string, existing: readonly { id: string; name: string }[]) => {
      check()
      const same = existing.find((f) => f.name === name)
      const fid = same?.id ?? id('file')
      stored.set(fid, { id: fid, name, parent: folderId, body, modifiedTime: new Date().toISOString() })
    }),
    read: vi.fn(async (_t: string, fileId: string) => {
      check()
      const f = stored.get(fileId)
      if (!f) throw new DriveError('not found', 404)
      return f.body
    }),
    remove: vi.fn(async (_t: string, fileId: string) => {
      check()
      stored.delete(fileId)
    }),
  }

  return {
    deps: { tokens, files } satisfies DriveDeps,
    tokens,
    files,
    /** File names in the backup folder, sorted. */
    names: () => [...stored.values()].map((f) => f.name).sort(),
    body: (name: string) => [...stored.values()].find((f) => f.name === name)?.body,
    /** Put a backup file straight into the folder (as if made on an earlier day). */
    seed(name: string, body: string) {
      let folder = [...folders].find(([, n]) => n === FOLDER_NAME)?.[0]
      if (!folder) {
        folder = id('folder')
        folders.set(folder, FOLDER_NAME)
      }
      const fid = id('file')
      stored.set(fid, { id: fid, name, parent: folder, body, modifiedTime: new Date().toISOString() })
      return fid
    },
    deleteFolder: () => folders.clear(),
    removeFile: (name: string) => {
      for (const [k, f] of stored) if (f.name === name) stored.delete(k)
    },
    setSignInFails: (v: boolean) => void (state.signInFails = v),
    setDown: (v: boolean) => void (state.down = v),
  }
}
