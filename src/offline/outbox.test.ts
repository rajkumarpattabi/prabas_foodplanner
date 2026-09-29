import { describe, expect, test, vi } from 'vitest'
import { PrabasDb, type OutboxOp } from './db.ts'
import { createOutbox, type OpResult } from './outbox.ts'
import { classify } from './executor.ts'

let n = 0
const update = (userId: string, name: string) =>
  ({ kind: 'update', table: 'households', match: { id: 'hh-1' }, patch: { name }, userId }) as const

function setup(results: OpResult['status'][] = []) {
  const db = new PrabasDb(`outbox-test-${++n}`)
  const sent: string[] = []
  const queue = [...results]
  const execute = vi.fn(async (op: OutboxOp): Promise<OpResult> => {
    const status = queue.shift() ?? 'ok'
    if (status === 'ok' && op.kind === 'update') sent.push(String(op.patch.name))
    return status === 'reject' ? { status, message: 'refused' } : { status }
  })
  const retries: (() => void)[] = []
  const user = { id: 'u1' as string | null }
  const outbox = createOutbox({ db, execute, currentUser: () => user.id, schedule: (fn) => retries.push(fn) })
  return { db, outbox, execute, sent, retries, user }
}

describe('outbox', () => {
  test('sends changes in the order they were made', async () => {
    const { outbox, sent, db } = setup()
    await outbox.enqueue(update('u1', 'a'))
    await outbox.enqueue(update('u1', 'b'))
    await outbox.enqueue(update('u1', 'c'))
    await outbox.flush()
    expect(sent).toEqual(['a', 'b', 'c'])
    expect(await db.outbox.count()).toBe(0)
  })

  test('offline: keeps the change, keeps the order, and retries later', async () => {
    const { outbox, sent, db, retries } = setup(['retry', 'retry'])
    await outbox.enqueue(update('u1', 'a'))
    await outbox.enqueue(update('u1', 'b'))
    await outbox.flush()
    expect(sent).toEqual([])
    expect(await db.outbox.count()).toBe(2)
    expect(retries.length).toBe(1) // one timer, however many attempts failed

    retries.shift()!()
    await outbox.flush()
    expect(sent).toEqual(['a', 'b'])
    expect(await db.outbox.count()).toBe(0)
  })

  test('the queue survives closing the app', async () => {
    const first = setup(['retry', 'retry']) // the send on enqueue, and the explicit one
    await first.outbox.enqueue(update('u1', 'a'))
    await first.outbox.flush()

    // Reopen: a new outbox over the same device database.
    const sent: string[] = []
    const outbox = createOutbox({
      db: first.db,
      execute: async (op) => (op.kind === 'update' && sent.push(String(op.patch.name)), { status: 'ok' }),
      currentUser: () => 'u1',
    })
    await outbox.flush()
    expect(sent).toEqual(['a'])
  })

  test('a refused change is dropped, reported, and does not block the rest', async () => {
    const { outbox, sent } = setup(['reject'])
    const rejected = vi.fn()
    outbox.onReject(rejected)
    await outbox.enqueue(update('u1', 'bad'))
    await outbox.enqueue(update('u1', 'good'))
    await outbox.flush()
    expect(rejected).toHaveBeenCalledWith(expect.objectContaining({ patch: { name: 'bad' } }), 'refused')
    expect(sent).toEqual(['good'])
  })

  test("another person's leftover changes are never sent", async () => {
    const { outbox, sent, db } = setup()
    await db.outbox.add({ ...update('someone-else', 'x'), id: 'old', createdAt: '', attempts: 0 })
    await outbox.enqueue(update('u1', 'mine'))
    await outbox.flush()
    expect(sent).toEqual(['mine'])
    expect(await db.outbox.count()).toBe(0)
  })

  test('only one send runs at a time', async () => {
    const { outbox, execute } = setup()
    await Promise.all([outbox.enqueue(update('u1', 'a')), outbox.flush(), outbox.flush()])
    await outbox.flush()
    expect(execute).toHaveBeenCalledTimes(1)
  })
})

describe('classify', () => {
  test('network trouble and server hiccups retry; refusals do not', () => {
    expect(classify(null)).toEqual({ status: 'ok' })
    expect(classify({ code: '', message: 'TypeError: Failed to fetch' })).toEqual({ status: 'retry' })
    expect(classify({ code: '', message: 'Load failed' }, 0)).toEqual({ status: 'retry' })
    expect(classify({ code: 'XX000', message: 'boom' }, 503)).toEqual({ status: 'retry' })
    expect(classify({ code: 'PGRST301', message: 'JWT expired' }, 401)).toEqual({ status: 'retry' })
    expect(classify({ code: '23514', message: 'violates check constraint' }, 400)).toEqual({
      status: 'reject',
      message: 'violates check constraint',
    })
    expect(classify({ code: '42501', message: 'permission denied' }, 403).status).toBe('reject')
  })
})
