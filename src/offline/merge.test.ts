import { describe, expect, test } from 'vitest'
import type { OutboxOp } from './db.ts'
import { mergeRows, withPending } from './merge.ts'

type Row = { id: string; name: string }

const insert = (table: string, id: string): OutboxOp => ({
  seq: 1,
  id: `op-${id}`,
  kind: 'insert',
  table,
  row: { id },
  userId: 'u1',
  createdAt: '',
  attempts: 0,
})

const update = (table: string, id: string, patch: Record<string, unknown>): OutboxOp => ({
  seq: 2,
  id: `op-${id}`,
  kind: 'update',
  table,
  match: { id },
  patch,
  userId: 'u1',
  createdAt: '',
  attempts: 0,
})

const none = new Map<string, number>()
const byId = (rows: Row[]) => Object.fromEntries(rows.map((r) => [r.id, r.name]))

describe('mergeRows', () => {
  test("the server's rows replace this device's, and rows gone from the server go", () => {
    const next = mergeRows<Row>({
      table: 'items',
      server: [{ id: 'a', name: 'server a' }],
      local: [
        { id: 'a', name: 'old a' },
        { id: 'b', name: 'deleted elsewhere' },
      ],
      pending: [],
      recent: none,
      fetchedFrom: 0,
    })
    expect(byId(next)).toEqual({ a: 'server a' })
  })

  test('rows still waiting in the outbox stay', () => {
    const next = mergeRows<Row>({
      table: 'stock_events',
      server: [],
      local: [{ id: 'e1', name: 'offline event' }],
      pending: [insert('stock_events', 'e1'), insert('items', 'e2')],
      recent: none,
      fetchedFrom: 0,
    })
    expect(byId(next)).toEqual({ e1: 'offline event' })
  })

  test('a queued edit is laid over the server copy, keeping what the other phone changed', () => {
    const next = mergeRows<Row & { step: number }>({
      table: 'items',
      server: [{ id: 'a', name: 'Ladies finger', step: 500 }],
      local: [{ id: 'a', name: 'Okra', step: 250 }],
      pending: [update('items', 'a', { name: 'Okra' })],
      recent: none,
      fetchedFrom: 0,
    })
    expect(next).toEqual([{ id: 'a', name: 'Okra', step: 500 }])
  })

  test('a row written after the server read began stays, even once sent', () => {
    const recent = new Map([
      ['new', 2_000],
      ['old', 500],
    ])
    const next = mergeRows<Row>({
      table: 'stock_events',
      server: [],
      local: [
        { id: 'new', name: 'sent during the reload' },
        { id: 'old', name: 'refused by the server' },
      ],
      pending: [],
      recent,
      fetchedFrom: 1_000,
    })
    expect(byId(next)).toEqual({ new: 'sent during the reload' })
  })
})

describe('deletes', () => {
  const del = (table: string, id: string): OutboxOp => ({
    seq: 3,
    id: `op-del-${id}`,
    kind: 'delete',
    table,
    match: { id },
    userId: 'u1',
    createdAt: '',
    attempts: 0,
  })

  test('a delete still waiting in the outbox keeps the row gone', () => {
    const next = mergeRows<Row>({
      table: 'dishes',
      server: [{ id: 'a', name: 'still on the server' }, { id: 'b', name: 'b' }],
      local: [{ id: 'b', name: 'b' }],
      pending: [del('dishes', 'a'), del('items', 'b')],
      recent: none,
      fetchedFrom: 0,
    })
    expect(byId(next)).toEqual({ b: 'b' })
  })

  test('a delete made after the server read began keeps the row gone, even once sent', () => {
    const next = mergeRows<Row>({
      table: 'dishes',
      server: [{ id: 'a', name: 'read before the delete' }, { id: 'old', name: 'deleted long ago, then re-added' }],
      local: [],
      pending: [],
      recent: none,
      deleted: new Map([
        ['a', 2_000],
        ['old', 500],
      ]),
      fetchedFrom: 1_000,
    })
    expect(byId(next)).toEqual({ old: 'deleted long ago, then re-added' })
  })

  test('a live update for a row queued here is patched, or dropped if deleted here', () => {
    expect(withPending('items', { id: 'a', name: 'server', step: 500 }, [update('items', 'a', { name: 'mine' })])).toEqual({
      id: 'a',
      name: 'mine',
      step: 500,
    })
    expect(withPending('dishes', { id: 'a', name: 'server' }, [del('dishes', 'a')])).toBeNull()
    expect(withPending('dishes', { id: 'a', name: 'server' }, [del('dishes', 'z')])).toEqual({ id: 'a', name: 'server' })
  })
})
