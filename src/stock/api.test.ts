import { describe, expect, test } from 'vitest'
import { toEvent, toItem } from './api.ts'
import { compareEvents } from './computeStock.ts'

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
