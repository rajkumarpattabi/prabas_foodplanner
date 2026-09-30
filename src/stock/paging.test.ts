import { describe, expect, test } from 'vitest'
import { supabaseBackupApi } from '../backup/api.ts'
import { BACKED_UP_TABLES } from '../backup/tables.ts'
import type { Supabase } from '../lib/supabase.ts'
import { supabaseStockApi } from './api.ts'

type Row = Record<string, unknown>

/**
 * Just enough of supabase-js's query builder for select … eq … order('id') … gt … limit,
 * with a server-side cap on rows per response, like Supabase's max rows setting.
 */
function fakeSupabase(tables: Record<string, Row[]>, cap: number) {
  let requests = 0
  const from = (table: string) => {
    const filters: ((r: Row) => boolean)[] = []
    let limit = Infinity
    const builder = {
      select: () => builder,
      eq: (col: string, v: unknown) => (filters.push((r) => r[col] === v), builder),
      gt: (col: string, v: string) => (filters.push((r) => String(r[col]) > v), builder),
      order: () => builder,
      limit: (n: number) => ((limit = n), builder),
      then: (resolve: (r: { data: Row[]; error: null }) => void) => {
        requests++
        const rows = (tables[table] ?? [])
          .filter((r) => filters.every((f) => f(r)))
          .sort((a, b) => String(a.id).localeCompare(String(b.id)))
          .slice(0, Math.min(limit, cap))
        resolve({ data: rows, error: null })
      },
    }
    return builder
  }
  return { sb: { from } as unknown as Supabase, requests: () => requests }
}

const T = '2026-09-30T10:00:00+00:00'
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const events = (count: number, household = 'hh') =>
  Array.from({ length: count }, (_, i) => ({
    id: id(i),
    household_id: household,
    item_id: 'item',
    kind: 'delta',
    quantity: '1',
    occurred_at: T,
    created_at: T,
  }))
const item = { id: 'item', household_id: 'hh', step: '250', aliases: [], created_at: T, updated_at: T }

describe('reading more rows than Supabase returns at once', () => {
  test.each([1000, 400])('stock load gets every event (server cap %i)', async (cap) => {
    const { sb } = fakeSupabase({ items: [item], stock_events: [...events(2500), ...events(3, 'other')] }, cap)
    const { events: loaded } = await supabaseStockApi(sb).load('hh')
    expect(loaded).toHaveLength(2500)
    expect(new Set(loaded.map((e) => e.id)).size).toBe(2500)
  })

  test.each([1000, 400])('backup gets every event (server cap %i)', async (cap) => {
    const { sb } = fakeSupabase({ profiles: [{ user_id: 'u1' }], items: [item], stock_events: events(2500) }, cap)
    const tables = await supabaseBackupApi(sb).fetchTables('hh', BACKED_UP_TABLES)
    expect(tables.stock_events).toHaveLength(2500)
    expect(tables.items).toHaveLength(1)
    expect(tables.profiles).toHaveLength(1)
  })
})
