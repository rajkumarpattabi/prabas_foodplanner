/// <reference types="google.accounts" />
// Google Identity Services: sign-in for Drive. Ported from MealFast's gdGetToken.
//
// - The script loads in the background and never blocks the app from opening.
// - Scope drive.file: the app sees only files it created.
// - prompt: "" shows Google's consent screen only the first time; after that it's silent.
// - The token is cached in memory until a minute before it expires.

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
const GIS_SRC = 'https://accounts.google.com/gsi/client'

export const googleClientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) || null

let loading: Promise<void> | null = null

export function gisReady(): boolean {
  return typeof google !== 'undefined' && !!google.accounts?.oauth2
}

/** Adds the Google script once. Resolves when ready; rejects if it can't load (offline). */
export function loadGis(): Promise<void> {
  if (gisReady()) return Promise.resolve()
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = GIS_SRC
    s.async = true
    s.defer = true
    s.onload = () => (gisReady() ? resolve() : reject(new Error('Google sign-in did not start')))
    s.onerror = () => {
      loading = null
      s.remove()
      reject(new Error('Google sign-in could not load'))
    }
    document.head.appendChild(s)
  })
  return loading
}

export class GoogleAuthError extends Error {}

export interface TokenSource {
  /** A valid access token, asking Google (and the user, the first time) if needed. */
  getToken(): Promise<string>
  /** Revokes the app's Drive access, then forgets the token. */
  revoke(): Promise<void>
  /** Forget the cached token, for example after Drive says it expired. */
  forget(): void
}

export function googleTokenSource(clientId: string): TokenSource {
  let client: google.accounts.oauth2.TokenClient | null = null
  let token: string | null = null
  let expiresAt = 0

  function request(): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      client ??= google.accounts.oauth2.initTokenClient({ client_id: clientId, scope: DRIVE_SCOPE, callback: () => {} })
      // The callbacks are set per request, as MealFast does.
      const c = client as google.accounts.oauth2.TokenClient & {
        callback: (r: google.accounts.oauth2.TokenResponse) => void
        error_callback: (e: google.accounts.oauth2.ClientConfigError) => void
      }
      c.callback = (resp) => {
        if (resp?.access_token) {
          token = resp.access_token
          const ttl = (Number(resp.expires_in) || 3600) * 1000 - 60_000 // one-minute safety margin
          expiresAt = Date.now() + Math.max(0, ttl)
          resolve(token)
        } else {
          reject(new GoogleAuthError(resp?.error_description || resp?.error || 'no token'))
        }
      }
      c.error_callback = (err) => reject(new GoogleAuthError(err?.type || 'auth error'))
      try {
        client.requestAccessToken({ prompt: '' })
      } catch {
        reject(new GoogleAuthError('popup blocked'))
      }
    })
  }

  return {
    async getToken() {
      if (token && Date.now() < expiresAt) return token
      await loadGis().catch(() => {
        throw new GoogleAuthError('Google sign-in is still loading. Try again.')
      })
      return request()
    },
    async revoke() {
      // After the app reopens there's no token in memory; get one (silently, since
      // consent was given before) so the access can actually be revoked.
      const t = token && Date.now() < expiresAt ? token : await this.getToken().catch(() => null)
      token = null
      expiresAt = 0
      if (t && gisReady()) await new Promise<void>((resolve) => google.accounts.oauth2.revoke(t, () => resolve()))
    },
    forget() {
      token = null
      expiresAt = 0
    },
  }
}
