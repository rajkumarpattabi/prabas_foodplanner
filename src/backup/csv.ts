import type { Backup } from './format.ts'
import type { CsvSection } from './tables.ts'

export function csvCell(v: unknown): string {
  const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * One file with clearly separated sections (a single download is reliable on iPhone),
 * each oldest first. A blank line separates sections.
 */
export function backupToCsv(backup: Backup, sections: readonly CsvSection[]): string {
  const blocks = sections.map((section) => {
    const source = section.rows ? section.rows(backup.tables) : (backup.tables[section.table] ?? [])
    const rows = [...source].sort((a, b) =>
      String(a[section.sortBy] ?? '').localeCompare(String(b[section.sortBy] ?? '')),
    )
    return [
      section.title,
      section.columns.map((c) => csvCell(c.label)).join(','),
      ...rows.map((r) => section.columns.map((c) => csvCell(r[c.key])).join(',')),
    ].join('\n')
  })
  // A byte-order mark so Excel reads Tamil text as UTF-8.
  return '﻿' + blocks.join('\n\n') + '\n'
}
