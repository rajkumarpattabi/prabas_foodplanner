import type { OutboxOp } from './db.ts'

/** When (ms) this device last wrote, or deleted, each row. */
export interface RecentWrites {
  get(id: string): number | undefined
}

interface MergeInput<T extends { id: string }> {
  table: string
  /** What the server returned. */
  server: readonly T[]
  /** What this device has now. */
  local: readonly T[]
  /** Changes on this device not yet sent. */
  pending: readonly OutboxOp[]
  /** Rows written here recently. */
  recent: RecentWrites
  /** Rows deleted here recently. */
  deleted?: RecentWrites
  /** When (ms) the server read began. */
  fetchedFrom: number
}

/**
 * The rows to keep after a full reload: the server's rows, except that nothing this
 * device has changed but the server hasn't seen yet is lost or rolled back.
 * - rows still waiting in the outbox stay
 * - rows written after the server read began stay as they are here
 * - queued edits are laid over the server's copy
 * - rows deleted here (queued, or since the read began) stay deleted
 */
export function mergeRows<T extends { id: string }>({
  table,
  server,
  local,
  pending,
  recent,
  deleted,
  fetchedFrom,
}: MergeInput<T>): T[] {
  const localById = new Map(local.map((r) => [r.id, r]))
  const next = new Map(server.map((r) => [r.id, r]))
  const gone = new Set<string>()

  for (const op of pending) {
    if (op.table !== table) continue
    if (op.kind === 'insert' && op.row.id && !next.has(op.row.id)) {
      const mine = localById.get(op.row.id)
      if (mine) next.set(mine.id, mine)
    }
    if (op.kind === 'update' && op.match.id) {
      const row = next.get(op.match.id)
      if (row) next.set(row.id, { ...row, ...(op.patch as Partial<T>) })
    }
    if (op.kind === 'delete' && op.match.id) gone.add(op.match.id)
  }

  for (const row of local) {
    const at = recent.get(row.id)
    if (at !== undefined && at >= fetchedFrom) next.set(row.id, row)
  }
  for (const id of next.keys()) {
    const at = deleted?.get(id)
    if (at !== undefined && at >= fetchedFrom) gone.add(id)
  }
  for (const id of gone) next.delete(id)

  return [...next.values()]
}

/** A row from the server, with this device's queued edits on top; null if it's queued for deletion here. */
export function withPending<T extends { id: string }>(table: string, row: T, pending: readonly OutboxOp[]): T | null {
  let out = row
  for (const op of pending) {
    if (op.table !== table || !('match' in op) || op.match.id !== row.id) continue
    if (op.kind === 'delete') return null
    if (op.kind === 'update') out = { ...out, ...(op.patch as Partial<T>) }
  }
  return out
}
