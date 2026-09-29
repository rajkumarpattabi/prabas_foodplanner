// Relative times and attribution lines: "Updated by you · 10 min ago".

/** "just now", "10 min ago", "3 hours ago", "2 days ago". */
export function relTime(iso: string | null | undefined, now = Date.now()): string | null {
  if (!iso) return null
  const m = Math.floor((now - new Date(iso).getTime()) / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`
  const d = Math.floor(h / 24)
  return `${d} day${d === 1 ? '' : 's'} ago`
}

interface AttributionInput {
  by: string | null
  at: string
  /** The signed-in user's id, shown as "you". */
  me: string
  /** Display names by user id. */
  names: ReadonlyMap<string, string>
  now?: number
}

/** "Updated by you · 10 min ago", "Updated by Priya · 2 hours ago", or "Updated · 3 days ago". */
export function attribution({ by, at, me, names, now }: AttributionInput): string {
  const who = by === me ? 'you' : by ? names.get(by) || null : null
  const when = relTime(at, now)
  return `Updated${who ? ` by ${who}` : ''} · ${when}`
}
