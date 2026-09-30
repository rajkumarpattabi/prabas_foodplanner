import { describe, expect, test } from 'vitest'
import type { OutboxOp } from '../offline/db.ts'
import { toEvent, toItem } from './api.ts'
import { compareEvents } from './computeStock.ts'
import { mergeRows } from './merge.ts'

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

describe('rows from Postgres', () => {
  const event = {
    id: 'e1',
    household_id: 'h',
    item_id: 'i',
    kind: 'delta',
    quantity: '500',
    reason: 'bought',
    batch_id: null,
    expires_on: null,
    form: 'whole',
    note: null,
    occurred_at: '2026-09-29T10:00:00.123456+00:00',
    created_at: '2026-09-29T10:00:01+00:00',
    created_by: 'u1',
  }

  test('numbers are numbers and times share one format, so events sort the same on every phone', () => {
    const fromServer = toEvent(event)
    expect(fromServer.quantity).toBe(500)
    expect(fromServer.occurred_at).toBe('2026-09-29T10:00:00.123Z')
    // Made on the phone a moment later: "…00.5Z" sorts after "…00.123456+00:00" only once normalised.
    const mine = { ...fromServer, id: 'e2', occurred_at: '2026-09-29T10:00:00.500Z' }
    expect([mine, fromServer].sort(compareEvents).map((e) => e.id)).toEqual(['e1', 'e2'])
  })

  test('item numbers and missing aliases', () => {
    const item = toItem({
      id: 'i',
      step: '250',
      low_threshold: '100',
      piece_weight_g: null,
      shelf_life_days: 5,
      opened_shelf_life_days: null,
      aliases: null,
      created_at: '2026-09-29T10:00:00+00:00',
      updated_at: '2026-09-29T10:00:00+00:00',
    })
    expect(item).toMatchObject({ step: 250, low_threshold: 100, piece_weight_g: null, aliases: [] })
    expect(item.created_at).toBe('2026-09-29T10:00:00.000Z')
  })
})
