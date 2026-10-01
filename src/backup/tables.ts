// What goes into a backup. Later batches add their tables here (and a matching
// restore line in the restore_snapshot SQL function), so backups grow with the app.

import { MEAL_CSV_COLUMNS, mealCsvRows } from '../plan/mealCsv.ts'
import { STOCK_CSV_COLUMNS, stockCsvRows } from '../stock/stockCsv.ts'
import type { Row } from './format.ts'

export interface BackedUpTable {
  name: string
  /**
   * household: rows with this household's household_id, replaced on restore.
   * people: rows about members (profiles), merged on restore.
   */
  scope: 'household' | 'people'
}

export const BACKED_UP_TABLES: readonly BackedUpTable[] = [
  { name: 'profiles', scope: 'people' },
  { name: 'items', scope: 'household' },
  { name: 'stock_events', scope: 'household' },
  { name: 'dishes', scope: 'household' },
  { name: 'meals', scope: 'household' },
  { name: 'leftovers', scope: 'household' },
]

/**
 * The spreadsheet-friendly CSV export: one section per entry, oldest first.
 * Stock and meal history, oldest first.
 */
export interface CsvSection {
  title: string
  table: string
  /** Columns to include, in order, with their header labels. */
  columns: readonly { key: string; label: string }[]
  /** Oldest first by this column. */
  sortBy: string
  /** For a section built from several tables: its rows. Otherwise the table's rows are used as they are. */
  rows?: (tables: Record<string, Row[]>) => Row[]
}

export const CSV_SECTIONS: readonly CsvSection[] = [
  {
    title: 'People',
    table: 'profiles',
    columns: [
      { key: 'display_name', label: 'name' },
      { key: 'script_pref', label: 'dish_names' },
      { key: 'created_at', label: 'joined' },
    ],
    sortBy: 'created_at',
  },
  {
    title: 'Stock',
    table: 'stock_events',
    columns: STOCK_CSV_COLUMNS,
    sortBy: 'occurred_at',
    rows: stockCsvRows,
  },
  {
    title: 'Meals',
    table: 'meals',
    columns: MEAL_CSV_COLUMNS,
    sortBy: 'sort',
    rows: mealCsvRows,
  },
]
