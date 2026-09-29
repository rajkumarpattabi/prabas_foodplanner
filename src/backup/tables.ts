// What goes into a backup. Later batches add their tables here (and a matching
// restore line in the restore_snapshot SQL function), so backups grow with the app.

export interface BackedUpTable {
  name: string
  /**
   * household: rows with this household's household_id, replaced on restore.
   * people: rows about members (profiles), merged on restore.
   */
  scope: 'household' | 'people'
}

export const BACKED_UP_TABLES: readonly BackedUpTable[] = [{ name: 'profiles', scope: 'people' }]

/**
 * The spreadsheet-friendly CSV export: one section per entry, oldest first.
 * Stock (Batch 2) and meal history (Batch 4) join this list when they exist.
 */
export interface CsvSection {
  title: string
  table: string
  /** Columns to include, in order, with their header labels. */
  columns: readonly { key: string; label: string }[]
  /** Oldest first by this column. */
  sortBy: string
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
]
