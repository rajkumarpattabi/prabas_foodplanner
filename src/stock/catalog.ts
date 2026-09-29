// The starter item catalogue: parsed from supabase/seed/item_catalog.psv, the one
// hand-edited source. `npm run catalog` turns it into migration 0005 and the review
// table in docs/ITEM_CATALOG.md. Runs in Node too (scripts/build-catalog.ts), so it
// uses no browser or app imports.

import { CATEGORIES, type BaseUnit, type Category, type EntryUnit } from './types.ts'

export interface CatalogItem {
  key: string
  name_ta: string
  name_en: string
  category: Category
  unit: BaseUnit
  display_unit: EntryUnit
  shelf_life_days: number | null
  is_staple: boolean
  low_threshold: number | null
  piece_weight_g: number | null
  has_opened_form: boolean
  opened_shelf_life_days: number | null
  step: number
  aliases: string[]
}

export const COLUMNS = [
  'key',
  'name_ta',
  'name_en',
  'category',
  'unit',
  'display_unit',
  'shelf_life_days',
  'is_staple',
  'low_threshold',
  'piece_weight_g',
  'opened_shelf_life_days',
  'step',
  'aliases',
] as const

const UNITS: readonly BaseUnit[] = ['g', 'ml', 'piece', 'bunch', 'packet']

/**
 * One item per line, columns separated by "|", aliases separated by ",".
 * Blank lines and lines starting with "#" are ignored. Throws with the line number
 * on anything invalid, so a typo can't slip into the database.
 */
export function parseCatalog(text: string): CatalogItem[] {
  const items: CatalogItem[] = []
  const lines = text.split(/\r?\n/)
  let header = true
  lines.forEach((raw, i) => {
    const line = raw.trim()
    if (!line || line.startsWith('#')) return
    const cells = line.split('|').map((c) => c.trim())
    const where = `item_catalog.psv line ${i + 1}`
    if (header) {
      if (cells.join('|') !== COLUMNS.join('|')) throw new Error(`${where}: header should be ${COLUMNS.join(' | ')}`)
      header = false
      return
    }
    if (cells.length !== COLUMNS.length) throw new Error(`${where}: expected ${COLUMNS.length} columns, got ${cells.length}`)
    const [key, name_ta, name_en, category, unit, display_unit, shelf, staple, low, pieceWeight, opened, step, aliases] =
      cells
    const num = (s: string, name: string): number | null => {
      if (s === '') return null
      const n = Number(s)
      if (!Number.isFinite(n) || n <= 0) throw new Error(`${where}: ${name} must be a positive number, got "${s}"`)
      return n
    }
    if (!/^[a-z0-9_]+$/.test(key)) throw new Error(`${where}: key "${key}" must be lower case letters, digits, or _`)
    if (!/[஀-௿]/.test(name_ta)) throw new Error(`${where}: name_ta "${name_ta}" has no Tamil script`)
    if (!name_en) throw new Error(`${where}: name_en is empty`)
    if (!CATEGORIES.includes(category as Category)) throw new Error(`${where}: unknown category "${category}"`)
    if (!UNITS.includes(unit as BaseUnit)) throw new Error(`${where}: unknown unit "${unit}"`)
    const displayOk =
      display_unit === unit || (unit === 'g' && display_unit === 'kg') || (unit === 'ml' && display_unit === 'l')
    if (!displayOk) throw new Error(`${where}: display_unit "${display_unit}" doesn't fit unit "${unit}"`)
    if (staple !== 'yes' && staple !== '') throw new Error(`${where}: is_staple must be "yes" or empty`)
    const stepN = num(step, 'step')
    if (stepN === null) throw new Error(`${where}: step is required`)
    const openedDays = num(opened, 'opened_shelf_life_days')
    items.push({
      key,
      name_ta,
      name_en,
      category: category as Category,
      unit: unit as BaseUnit,
      display_unit: display_unit as EntryUnit,
      shelf_life_days: num(shelf, 'shelf_life_days'),
      is_staple: staple === 'yes',
      low_threshold: num(low, 'low_threshold'),
      piece_weight_g: num(pieceWeight, 'piece_weight_g'),
      has_opened_form: openedDays !== null,
      opened_shelf_life_days: openedDays,
      step: stepN,
      aliases: aliases
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean),
    })
  })
  const seen = new Set<string>()
  for (const item of items) {
    if (seen.has(item.key)) throw new Error(`item_catalog.psv: duplicate key "${item.key}"`)
    seen.add(item.key)
  }
  return items
}

const sqlText = (s: string) => `'${s.replace(/'/g, "''")}'`
const sqlNum = (n: number | null) => (n === null ? 'null' : String(n))

/** Migration 0005: load the catalogue and seed households that already exist. */
export function catalogToSql(items: readonly CatalogItem[]): string {
  const rows = items.map(
    (i) =>
      `  (${[
        sqlText(i.key),
        sqlText(i.name_ta),
        sqlText(i.name_en),
        `array[${i.aliases.map(sqlText).join(', ')}]::text[]`,
        sqlText(i.category),
        sqlText(i.unit),
        sqlText(i.display_unit),
        sqlNum(i.shelf_life_days),
        String(i.is_staple),
        sqlNum(i.low_threshold),
        sqlNum(i.piece_weight_g),
        String(i.has_opened_form),
        sqlNum(i.opened_shelf_life_days),
        sqlNum(i.step),
      ].join(', ')})`,
  )
  return `-- ============================================================================
-- PRABAS Food Planner · 0005 starter item catalogue
--
-- GENERATED by \`npm run catalog\` from supabase/seed/item_catalog.psv.
-- Edit that file, not this one. (${items.length} items.)
--
-- Loads the catalogue, then gives every existing household its own copy.
-- Safe to run again: existing catalogue rows are updated, and households only
-- get items they don't already have.
-- ============================================================================

insert into private.item_catalog (
  key, name_ta, name_en, aliases, category, unit, display_unit, shelf_life_days,
  is_staple, low_threshold, piece_weight_g, has_opened_form, opened_shelf_life_days, step
) values
${rows.join(',\n')}
on conflict (key) do update set
  name_ta = excluded.name_ta, name_en = excluded.name_en, aliases = excluded.aliases,
  category = excluded.category, unit = excluded.unit, display_unit = excluded.display_unit,
  shelf_life_days = excluded.shelf_life_days, is_staple = excluded.is_staple,
  low_threshold = excluded.low_threshold, piece_weight_g = excluded.piece_weight_g,
  has_opened_form = excluded.has_opened_form, opened_shelf_life_days = excluded.opened_shelf_life_days,
  step = excluded.step;

select private.seed_household_items(id) from public.households;
`
}

/** The review table: grouped by category, easy to scan on a phone or in a browser. */
export function catalogToMarkdown(items: readonly CatalogItem[]): string {
  const cell = (s: string) => s.replace(/\|/g, '\\|')
  const shelf = (i: CatalogItem) =>
    (i.shelf_life_days ? `${i.shelf_life_days} d` : 'keeps') + (i.opened_shelf_life_days ? `, opened ${i.opened_shelf_life_days} d` : '')
  const sections = CATEGORIES.map((c) => {
    const rows = items.filter((i) => i.category === c)
    if (!rows.length) return ''
    return [
      `## ${c[0].toUpperCase()}${c.slice(1)} (${rows.length})`,
      '',
      '| Tamil | English | Aliases | Unit | Keeps | Staple |',
      '|---|---|---|---|---|---|',
      ...rows.map(
        (i) =>
          `| ${cell(i.name_ta)} | ${cell(i.name_en)} | ${cell(i.aliases.join(', '))} | ${i.display_unit} | ${shelf(i)} | ${i.is_staple ? 'yes' : ''} |`,
      ),
      '',
    ].join('\n')
  }).filter(Boolean)
  return `# Starter item catalogue (${items.length} items)

Generated by \`npm run catalog\` from \`supabase/seed/item_catalog.psv\`. To change an item,
edit that file (one item per line), run \`npm run catalog\`, and commit both.

Please check: Tamil spellings, the aliases you'd actually type or see on a bill, and
which items are staples. **Staples are listed on the Stock screen even when you have
none**, so untick staples you don't buy.

${sections.join('\n')}`
}
