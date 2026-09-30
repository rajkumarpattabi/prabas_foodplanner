// The Stock section of the CSV export: every stock event, readable in a spreadsheet.

import { localDate } from '../lib/dates.ts'
import { toEvent, toItem } from './api.ts'
import { describeEvent } from './history.ts'

type Row = Record<string, unknown>

export const STOCK_CSV_COLUMNS = [
  { key: 'date', label: 'date' },
  { key: 'item_ta', label: 'item_ta' },
  { key: 'item_en', label: 'item_en' },
  { key: 'what', label: 'what' },
  { key: 'change', label: 'change' },
  { key: 'set_to', label: 'set_to' },
  { key: 'unit', label: 'unit' },
  { key: 'reason', label: 'reason' },
  { key: 'by', label: 'by' },
] as const

/** "2026-09-30 18:05", in the phone's local time. */
function localDateTime(iso: string): string {
  const d = new Date(iso)
  return `${localDate(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * One row per stock event, with the item's names and who made it filled in.
 * `change` is signed (+ bought, − used) and `set_to` holds corrections, so both
 * columns can be summed. Rows keep `occurred_at` for sorting.
 */
export function stockCsvRows(tables: Record<string, Row[]>): Row[] {
  const items = new Map((tables.items ?? []).map((r) => [String(r.id), toItem(r)]))
  const names = new Map((tables.profiles ?? []).map((p) => [String(p.user_id), String(p.display_name ?? '')]))
  return (tables.stock_events ?? []).map((raw) => {
    const e = toEvent(raw)
    const item = items.get(e.item_id)
    return {
      occurred_at: e.occurred_at,
      date: localDateTime(e.occurred_at),
      item_ta: item?.name_ta ?? '',
      item_en: item?.name_en ?? '',
      what: item ? describeEvent(e, item) : e.kind,
      change: e.kind === 'delta' ? e.quantity : '',
      set_to: e.kind === 'set' ? e.quantity : '',
      unit: item?.unit ?? '',
      reason: e.reason ?? '',
      by: (e.created_by && names.get(e.created_by)) || '',
    }
  })
}
