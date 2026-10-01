import { describe, expect, test } from 'vitest'
import { backupToCsv } from '../backup/csv.ts'
import { buildBackup } from '../backup/format.ts'
import { CSV_SECTIONS } from '../backup/tables.ts'

const names = (pairs: [string, string][]) => pairs.map(([name_ta, name_en]) => ({ dish_id: name_en, name_ta, name_en, type: 'tiffin' }))

const tables = {
  profiles: [
    { user_id: 'u1', display_name: 'Raj' },
    { user_id: 'u2', display_name: 'Priya' },
  ],
  meals: [
    {
      id: 'h:2026-09-28:dinner',
      date: '2026-09-28',
      meal: 'dinner',
      dish_names: names([['இட்லி', 'Idli']]),
      status: 'cooked',
      created_by: 'u1',
      cooked_by: 'u2',
    },
    {
      id: 'h:2026-09-28:breakfast',
      date: '2026-09-28',
      meal: 'breakfast',
      dish_names: names([
        ['வெண் பொங்கல்', 'Ven pongal'],
        ['தேங்காய் சட்னி', 'Coconut chutney'],
      ]),
      status: 'cooked',
      created_by: 'u2',
      cooked_by: 'u1',
    },
    { id: 'h:2026-10-02:lunch', date: '2026-10-02', meal: 'lunch', dish_names: names([['சாதம்', 'Plain rice']]), status: 'planned', created_by: 'u2', cooked_by: null },
  ],
}

describe('Meals section of the CSV', () => {
  test('oldest first, breakfast before dinner, with dishes in both scripts and who planned and cooked', () => {
    const csv = backupToCsv(buildBackup('h', tables), CSV_SECTIONS)
    const meals = csv.slice(csv.indexOf('Meals\n')).trim().split('\n')
    expect(meals).toEqual([
      'Meals',
      'date,meal,dishes_ta,dishes_en,status,planned_by,cooked_by',
      '2026-09-28,breakfast,வெண் பொங்கல் + தேங்காய் சட்னி,Ven pongal + Coconut chutney,cooked,Priya,Raj',
      '2026-09-28,dinner,இட்லி,Idli,cooked,Raj,Priya',
      '2026-10-02,lunch,சாதம்,Plain rice,planned,Priya,',
    ])
  })
})
