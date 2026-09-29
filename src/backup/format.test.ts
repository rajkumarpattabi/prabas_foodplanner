import { describe, expect, test } from 'vitest'
import { backupToCsv, csvCell } from './csv.ts'
import { backupFileName, buildBackup, CURRENT_SCHEMA_VERSION, parseBackup, type Backup } from './format.ts'
import type { CsvSection } from './tables.ts'

const sample = buildBackup('hh-1', { profiles: [{ user_id: 'u1', display_name: 'ராஜ்' }] }, new Date('2026-09-27T20:15:00Z'))

describe('parseBackup', () => {
  test('a fresh backup reads back unchanged', () => {
    const result = parseBackup(JSON.stringify(sample))
    expect(result).toEqual({ ok: true, backup: sample })
    expect(sample).toMatchObject({ app: 'PRABAS', schemaVersion: CURRENT_SCHEMA_VERSION, householdId: 'hh-1' })
  })

  test.each([
    ['not JSON', '{oops', "Couldn't read that file."],
    ['another app', JSON.stringify({ app: 'MealFast', version: 1 }), 'Not a PRABAS backup.'],
    ['no version', JSON.stringify({ ...sample, schemaVersion: undefined }), 'This backup is damaged: it has no version.'],
    ['no tables', JSON.stringify({ ...sample, tables: [] }), 'This backup is damaged: it has no data.'],
    ['a table that is not a list', JSON.stringify({ ...sample, tables: { items: {} } }), 'This backup is damaged: "items" isn\'t a list.'],
    [
      'a newer version',
      JSON.stringify({ ...sample, schemaVersion: CURRENT_SCHEMA_VERSION + 1 }),
      'This backup is from a newer version of PRABAS. Update the app, then try again.',
    ],
  ])('rejects %s with a plain message', (_case, text, error) => {
    expect(parseBackup(text)).toEqual({ ok: false, error })
  })

  test('older backups are migrated forward, one version at a time', () => {
    const v1: Backup = { ...sample, schemaVersion: 1, tables: { profiles: [{ user_id: 'u1', name: 'Raj' }] } }
    const migrations = {
      // v2 renamed profiles.name to display_name
      1: (b: Backup) => ({
        ...b,
        tables: { ...b.tables, profiles: b.tables.profiles.map(({ name, ...rest }) => ({ ...rest, display_name: name })) },
      }),
      // v3 added an empty items table
      2: (b: Backup) => ({ ...b, tables: { ...b.tables, items: [] } }),
    }
    const result = parseBackup(JSON.stringify(v1), 3, migrations)
    expect(result).toEqual({
      ok: true,
      backup: { ...v1, schemaVersion: 3, tables: { profiles: [{ user_id: 'u1', display_name: 'Raj' }], items: [] } },
    })
  })

  test('a missing migration step is reported, not skipped', () => {
    const result = parseBackup(JSON.stringify({ ...sample, schemaVersion: 1 }), 3, { 2: (b: Backup) => b })
    expect(result).toEqual({ ok: false, error: "This backup can't be upgraded from version 1." })
  })
})

describe('file names', () => {
  test('use the local date', () => {
    expect(backupFileName(new Date(2026, 8, 7, 23, 30))).toBe('prabas-backup-2026-09-07.json')
  })
})

describe('CSV', () => {
  test('cells with commas, quotes, or new lines are quoted', () => {
    expect(csvCell('plain')).toBe('plain')
    expect(csvCell('a, b')).toBe('"a, b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('two\nlines')).toBe('"two\nlines"')
    expect(csvCell(null)).toBe('')
    expect(csvCell(['a', 'b'])).toBe('"[""a"",""b""]"')
  })

  test('one section per table, oldest first, blank line between, Tamil kept', () => {
    const sections: CsvSection[] = [
      { title: 'People', table: 'profiles', columns: [{ key: 'display_name', label: 'name' }], sortBy: 'created_at' },
      { title: 'Stock', table: 'stock_events', columns: [{ key: 'qty', label: 'qty' }], sortBy: 'created_at' },
    ]
    const backup = buildBackup('hh-1', {
      profiles: [
        { display_name: 'அம்மா', created_at: '2026-09-02' },
        { display_name: 'Raj', created_at: '2026-09-01' },
      ],
      stock_events: [],
    })
    expect(backupToCsv(backup, sections)).toBe('﻿People\nname\nRaj\nஅம்மா\n\nStock\nqty\n')
  })
})
