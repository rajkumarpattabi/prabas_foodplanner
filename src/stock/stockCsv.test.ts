import { describe, expect, test } from 'vitest'
import { backupToCsv } from '../backup/csv.ts'
import { buildBackup } from '../backup/format.ts'
import { CSV_SECTIONS } from '../backup/tables.ts'
import { stockCsvRows } from './stockCsv.ts'

const at = (h: number) => new Date(2026, 8, 30, h, 5).toISOString()
const tables = {
  profiles: [
    { user_id: 'u1', display_name: 'Raj' },
    { user_id: 'u2', display_name: 'Priya' },
  ],
  items: [
    {
      id: 'okra',
      name_ta: 'வெண்டைக்காய்',
      name_en: 'Ladies finger',
      unit: 'g',
      piece_weight_g: null,
      step: '250',
      aliases: [],
      created_at: at(1),
      updated_at: at(1),
    },
  ],
  stock_events: [
    { id: 'b', item_id: 'okra', kind: 'delta', quantity: '-250', reason: 'cooked', form: 'whole', occurred_at: at(12), created_at: at(12), created_by: 'u2' },
    { id: 'a', item_id: 'okra', kind: 'delta', quantity: 1000, reason: 'bought', form: 'whole', expires_on: '2026-10-05', occurred_at: at(9), created_at: at(9), created_by: 'u1' },
    { id: 'c', item_id: 'okra', kind: 'set', quantity: 300, reason: 'correction', form: 'whole', occurred_at: at(18), created_at: at(18), created_by: 'u1' },
  ],
}

describe('Stock section of the CSV', () => {
  test('each event with its item, a signed change, and who made it', () => {
    const rows = stockCsvRows(tables)
    const a = rows.find((r) => r.what === 'Bought 1 kg · use by 5 Oct')!
    expect(a).toMatchObject({ date: '2026-09-30 09:05', item_ta: 'வெண்டைக்காய்', item_en: 'Ladies finger', change: 1000, set_to: '', unit: 'g', reason: 'bought', by: 'Raj' })
    expect(rows.find((r) => r.reason === 'cooked')).toMatchObject({ change: -250, by: 'Priya' })
    expect(rows.find((r) => r.reason === 'correction')).toMatchObject({ change: '', set_to: 300 })
  })

  test('in the export, oldest first, after People', () => {
    const csv = backupToCsv(buildBackup('hh', tables), CSV_SECTIONS)
    const stock = csv.split('\n\n')[1].trim().split('\n')
    expect(stock[0]).toBe('Stock')
    expect(stock[1]).toBe('date,item_ta,item_en,what,change,set_to,unit,reason,by')
    expect(stock.slice(2).map((l) => l.split(',')[0])).toEqual(['2026-09-30 09:05', '2026-09-30 12:05', '2026-09-30 18:05'])
    expect(stock[2]).toBe('2026-09-30 09:05,வெண்டைக்காய்,Ladies finger,Bought 1 kg · use by 5 Oct,1000,,g,bought,Raj')
  })

  test('a backup with no stock has an empty Stock section', () => {
    const csv = backupToCsv(buildBackup('hh', { profiles: tables.profiles }), CSV_SECTIONS)
    expect(csv).toContain('Stock\ndate,item_ta,item_en,what,change,set_to,unit,reason,by\n')
  })
})
