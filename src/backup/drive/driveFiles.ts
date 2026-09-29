// Google Drive REST calls for PRABAS backups, ported from MealFast's gdFindFile,
// gdPatch, gdCreate, and gdUpload, with rolling files in a folder the app creates.

import type { DriveFile } from './retention.ts'

export const FOLDER_NAME = 'PRABAS backups'
const FOLDER_MIME = 'application/vnd.google-apps.folder'
const API = 'https://www.googleapis.com/drive/v3/files'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'

/** A Drive call failed. `status` 401 means sign in again; 404 means the file is gone. */
export class DriveError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export interface BackupFileInfo extends DriveFile {
  modifiedTime: string
}

export interface DriveFiles {
  /** The backup folder's id: the cached one if it still exists, else found by name, else created. */
  ensureFolder(token: string, cachedId: string | null): Promise<string>
  list(token: string, folderId: string): Promise<BackupFileInfo[]>
  /** Creates the file, or replaces it if one with this name is already in the folder. */
  save(token: string, folderId: string, name: string, body: string, existing: readonly DriveFile[]): Promise<void>
  read(token: string, fileId: string): Promise<string>
  remove(token: string, fileId: string): Promise<void>
}

type Fetch = typeof fetch

export function driveFiles(fetchFn: Fetch = (...a) => fetch(...a)): DriveFiles {
  async function call(token: string, url: string, init: RequestInit = {}): Promise<Response> {
    const res = await fetchFn(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...init.headers } })
    if (!res.ok) throw new DriveError(`Drive ${init.method ?? 'GET'} failed`, res.status)
    return res
  }

  const q = (query: string) => encodeURIComponent(query)
  const escape = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")

  async function findFolder(token: string): Promise<string | null> {
    const query = `name='${escape(FOLDER_NAME)}' and mimeType='${FOLDER_MIME}' and trashed=false`
    const res = await call(token, `${API}?q=${q(query)}&spaces=drive&fields=files(id)&orderBy=createdTime`)
    const j = (await res.json()) as { files?: { id: string }[] }
    return j.files?.[0]?.id ?? null
  }

  async function folderExists(token: string, id: string): Promise<boolean> {
    try {
      const res = await call(token, `${API}/${id}?fields=id,trashed`)
      return !((await res.json()) as { trashed?: boolean }).trashed
    } catch (e) {
      if (e instanceof DriveError && e.status === 404) return false
      throw e
    }
  }

  return {
    async ensureFolder(token, cachedId) {
      if (cachedId && (await folderExists(token, cachedId))) return cachedId
      const found = await findFolder(token)
      if (found) return found
      const res = await call(token, `${API}?fields=id`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: FOLDER_NAME, mimeType: FOLDER_MIME }),
      })
      return ((await res.json()) as { id: string }).id
    },

    async list(token, folderId) {
      const query = `'${escape(folderId)}' in parents and trashed=false`
      const res = await call(
        token,
        `${API}?q=${q(query)}&spaces=drive&fields=files(id,name,modifiedTime)&orderBy=name desc&pageSize=200`,
      )
      return (((await res.json()) as { files?: BackupFileInfo[] }).files ?? []).filter((f) =>
        f.name.startsWith('prabas-backup-'),
      )
    },

    async save(token, folderId, name, body, existing) {
      const same = existing.find((f) => f.name === name)
      if (same) {
        await call(token, `${UPLOAD}/${same.id}?uploadType=media`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body,
        })
        return
      }
      const boundary = `prabas${Math.random().toString(36).slice(2)}`
      const meta = JSON.stringify({ name, mimeType: 'application/json', parents: [folderId] })
      const multipart =
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n` +
        `--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`
      await call(token, `${UPLOAD}?uploadType=multipart&fields=id`, {
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body: multipart,
      })
    },

    async read(token, fileId) {
      return (await call(token, `${API}/${fileId}?alt=media`)).text()
    },

    async remove(token, fileId) {
      await call(token, `${API}/${fileId}`, { method: 'DELETE' })
    },
  }
}
