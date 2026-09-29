import type { OutboxOp, PrabasDb } from './db.ts'

/**
 * How a replayed op turned out:
 * - ok: saved, remove it from the queue
 * - retry: couldn't reach the server (offline, timeout, 5xx), keep it and try later
 * - reject: the server refused it (rules, constraints); drop it and tell the user
 */
export type OpResult = { status: 'ok' } | { status: 'retry' } | { status: 'reject'; message: string }

export type Executor = (op: OutboxOp) => Promise<OpResult>

type NewOp = OutboxOp extends infer O ? (O extends OutboxOp ? Omit<O, 'seq' | 'id' | 'createdAt' | 'attempts'> : never) : never

export interface Outbox {
  /** Save a change locally, then try to send it. Resolves once it is safely queued. */
  enqueue(op: NewOp): Promise<void>
  /** Send queued changes in order. Safe to call often; only one run at a time. */
  flush(): Promise<void>
  pending(userId: string): Promise<OutboxOp[]>
  /** Called after every flush that changed the queue (to refresh UI). */
  onChange(listener: () => void): () => void
  /** Called when the server refused a change. */
  onReject(listener: (op: OutboxOp, message: string) => void): () => void
}

const RETRY_BASE_MS = 2_000
const RETRY_MAX_MS = 60_000

interface Options {
  db: PrabasDb
  execute: Executor
  /** Whose ops to send. Ops from anyone else (an earlier login) are dropped. */
  currentUser: () => string | null
  /** For tests. */
  schedule?: (fn: () => void, ms: number) => void
}

export function createOutbox({ db, execute, currentUser, schedule = (fn, ms) => void setTimeout(fn, ms) }: Options): Outbox {
  const changeListeners = new Set<() => void>()
  const rejectListeners = new Set<(op: OutboxOp, message: string) => void>()
  let running: Promise<void> | null = null
  let again = false
  let retryTimer = false
  let failures = 0

  const notify = () => changeListeners.forEach((l) => l())

  function scheduleRetry() {
    if (retryTimer) return
    retryTimer = true
    const ms = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.min(failures, 5))
    schedule(() => {
      retryTimer = false
      void flush()
    }, ms)
  }

  async function run(): Promise<void> {
    const user = currentUser()
    for (;;) {
      const op = await db.outbox.orderBy('seq').first()
      if (!op) break
      if (!user || op.userId !== user) {
        await db.outbox.delete(op.seq!)
        continue
      }
      let result: OpResult
      try {
        result = await execute(op)
      } catch {
        result = { status: 'retry' }
      }
      if (result.status === 'retry') {
        failures++
        await db.outbox.update(op.seq!, { attempts: op.attempts + 1 })
        scheduleRetry()
        return // Keep order: nothing after this op goes before it.
      }
      failures = 0
      await db.outbox.delete(op.seq!)
      if (result.status === 'reject') rejectListeners.forEach((l) => l(op, result.message))
      notify()
    }
  }

  function flush(): Promise<void> {
    if (running) {
      again = true
      return running
    }
    running = (async () => {
      try {
        do {
          again = false
          await run()
        } while (again)
      } finally {
        running = null
        notify()
      }
    })()
    return running
  }

  return {
    async enqueue(op) {
      await db.outbox.add({ ...op, id: crypto.randomUUID(), createdAt: new Date().toISOString(), attempts: 0 } as OutboxOp)
      notify()
      void flush()
    },
    flush,
    pending: (userId) => db.outbox.where('userId').equals(userId).sortBy('seq'),
    onChange(listener) {
      changeListeners.add(listener)
      return () => changeListeners.delete(listener)
    },
    onReject(listener) {
      rejectListeners.add(listener)
      return () => rejectListeners.delete(listener)
    },
  }
}
