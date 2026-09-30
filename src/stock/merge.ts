import type { OutboxOp } from '../offline/db.ts'
import type { StockTable } from './api.ts'

/** Local writes are kept this long in memory, in case a reload that started earlier would miss them. */
export interface RecentWrites {
  /** id → when (ms) this device last wrote the row. */
  get(id: string): number | undefined
}

interface MergeInput<T extends { id: string }> {
  table: StockTable
  /** What the server returned. */
  server: readonly T[]
  /** What this device has now. */
  local: readonly T[]
  /** Changes on this device not yet sent. */
  pending: readonly OutboxOp[]
  recent: RecentWrites
  /** When (ms) the server read began. */
  fetchedFrom: number
}

/**
 * The rows to keep after a full reload: the server's rows, except that nothing this
 * device has changed but the server hasn't seen yet is lost or rolled back.
 * - rows still waiting in the outbox stay
 * - rows written after the server read began stay as they are here
 * - queued edits are laid over the server's copy
 */
export function mergeRows<T extends { id: string }>({ table, server, local, pending, recent, fetchedFrom }: MergeInput<T>): T[] {
  const localById = new Map(local.map((r) => [r.id, r]))
  const next = new Map(server.map((r) => [r.id, r]))

  for (const op of pending) {
    if (op.table !== table) continue
    if (op.kind === 'insert' && !next.has(op.row.id)) {
      const mine = localById.get(op.row.id)
      if (mine) next.set(mine.id, mine)
    }
    if (op.kind === 'update' && op.match.id) {
      const row = next.get(op.match.id)
      if (row) next.set(row.id, { ...row, ...(op.patch as Partial<T>) })
    }
  }

  for (const row of local) {
    const at = recent.get(row.id)
    if (at !== undefined && at >= fetchedFrom) next.set(row.id, row)
  }

  return [...next.values()]
}
