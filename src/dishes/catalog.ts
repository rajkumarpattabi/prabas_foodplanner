// The starter dish catalogue: parsed from supabase/seed/dish_catalog.psv, the one
// hand-edited source. `npm run catalog` turns it into migration 0007 and the review
// table in docs/DISH_CATALOG.md. Runs in Node too (scripts/build-catalog.ts), so it
// uses no browser or app imports.

import type { CatalogItem } from '../stock/catalog.ts'
import { DISH_TAGS, DISH_TYPES, MEALS, type DishTag, type DishType, type Meal } from './types.ts'

export interface CatalogIngredient {
  /** An item catalogue key. */
  item: string
  /** For five people, in the item's stored unit. */
  quantity: number
  optional: boolean
}

export interface CatalogDish {
  key: string
  name_ta: string
  name_en: string
  type: DishType
  meals: Meal[]
  tags: DishTag[]
  /** Dish catalogue keys, best first. */
  sides: string[]
  ingredients: CatalogIngredient[]
  aliases: string[]
}

export const DISH_COLUMNS = ['key', 'name_ta', 'name_en', 'type', 'meals', 'tags', 'sides', 'ingredients', 'aliases'] as const

export const list = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)

/** `item_key:250,other:0.25?` → ingredients. Throws, saying where, on anything invalid. */
export function parseCatalogIngredients(text: string, where: string): CatalogIngredient[] {
  return list(text).map((entry) => {
    const m = /^([a-z0-9_]+):([0-9.]+)(\?)?$/.exec(entry)
    const quantity = m ? Number(m[2]) : NaN
    if (!m || !(quantity > 0)) throw new Error(`${where}: ingredient "${entry}" should look like item_key:250`)
    return { item: m[1], quantity, optional: m[3] === '?' }
  })
}

/**
 * One dish per line, columns separated by "|", lists separated by ",".
 * Ingredients are `item_key:quantity`, with a trailing `?` for optional ones
 * (`karuveppilai:0.25?`). Throws with the line number on anything invalid.
 */
export function parseDishCatalog(text: string): CatalogDish[] {
  const dishes: CatalogDish[] = []
  let header = true
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim()
    if (!line || line.startsWith('#')) return
    const cells = line.split('|').map((c) => c.trim())
    const where = `dish_catalog.psv line ${i + 1}`
    if (header) {
      if (cells.join('|') !== DISH_COLUMNS.join('|')) throw new Error(`${where}: header should be ${DISH_COLUMNS.join(' | ')}`)
      header = false
      return
    }
    if (cells.length !== DISH_COLUMNS.length) throw new Error(`${where}: expected ${DISH_COLUMNS.length} columns, got ${cells.length}`)
    const [key, name_ta, name_en, type, meals, tags, sides, ingredients, aliases] = cells
    if (!/^[a-z0-9_]+$/.test(key)) throw new Error(`${where}: key "${key}" must be lower case letters, digits, or _`)
    if (!/[஀-௿]/.test(name_ta)) throw new Error(`${where}: name_ta "${name_ta}" has no Tamil script`)
    if (!name_en) throw new Error(`${where}: name_en is empty`)
    if (!DISH_TYPES.includes(type as DishType)) throw new Error(`${where}: unknown type "${type}"`)
    const mealList = list(meals)
    if (!mealList.length) throw new Error(`${where}: at least one meal is needed`)
    for (const m of mealList) if (!MEALS.includes(m as Meal)) throw new Error(`${where}: unknown meal "${m}"`)
    for (const t of list(tags)) if (!DISH_TAGS.includes(t as DishTag)) throw new Error(`${where}: unknown tag "${t}"`)
    const parsedIngredients = parseCatalogIngredients(ingredients, where)
    dishes.push({
      key,
      name_ta,
      name_en,
      type: type as DishType,
      meals: mealList as Meal[],
      tags: list(tags) as DishTag[],
      sides: list(sides),
      ingredients: parsedIngredients,
      aliases: list(aliases),
    })
  })
  return dishes
}

const NON_VEG_CATEGORIES = new Set(['meat', 'fish', 'egg'])

/** Is a catalogue dish non-veg? The same rule as isVeg in rules.ts: meat, fish or egg. */
export function catalogDishIsVeg(dish: CatalogDish, itemsByKey: ReadonlyMap<string, Pick<CatalogItem, 'category'>>): boolean {
  return !dish.ingredients.some((i) => NON_VEG_CATEGORIES.has(itemsByKey.get(i.item)?.category ?? ''))
}

/** Everything that would make the catalogue wrong, as readable messages. Empty when it's fine. */
export function checkDishCatalog(dishes: readonly CatalogDish[], items: readonly CatalogItem[]): string[] {
  const errors: string[] = []
  const itemsByKey = new Map(items.map((i) => [i.key, i]))
  const dishKeys = new Set<string>()
  for (const d of dishes) {
    if (dishKeys.has(d.key)) errors.push(`${d.key}: duplicate key`)
    dishKeys.add(d.key)
  }
  for (const d of dishes) {
    const seen = new Set<string>()
    for (const ing of d.ingredients) {
      if (!itemsByKey.has(ing.item)) errors.push(`${d.key}: ingredient "${ing.item}" isn't in the item catalogue`)
      if (seen.has(ing.item)) errors.push(`${d.key}: ingredient "${ing.item}" is listed twice`)
      seen.add(ing.item)
    }
    for (const s of d.sides) {
      if (s === d.key) errors.push(`${d.key}: can't be its own side`)
      else if (!dishKeys.has(s)) errors.push(`${d.key}: side "${s}" isn't a dish in the catalogue`)
    }
    if (new Set(d.sides).size !== d.sides.length) errors.push(`${d.key}: a side is listed twice`)
    const veg = catalogDishIsVeg(d, itemsByKey)
    if ((d.type === 'nonveg_gravy' || d.type === 'nonveg_fry') && veg) errors.push(`${d.key}: a non-veg type with no meat, fish or egg`)
    if (d.tags.includes('fish') && !d.ingredients.some((i) => itemsByKey.get(i.item)?.category === 'fish')) {
      errors.push(`${d.key}: tagged fish with no fish in it`)
    }
    if (!d.ingredients.length) errors.push(`${d.key}: no ingredients`)
  }
  return errors
}

const sqlText = (s: string) => `'${s.replace(/'/g, "''")}'`
const sqlTextArray = (xs: readonly string[]) => `array[${xs.map(sqlText).join(', ')}]::text[]`
/** Ingredients as the catalogue stores them: [{item, quantity, optional?}]. */
export const catalogIngredientsJson = (list: readonly CatalogIngredient[]) =>
  JSON.stringify(list.map((i) => (i.optional ? { item: i.item, quantity: i.quantity, optional: true } : { item: i.item, quantity: i.quantity })))
const ingredientsJson = (d: CatalogDish) => catalogIngredientsJson(d.ingredients)

/** Migration 0007: load the dish catalogue and seed households that already exist. */
export function dishCatalogToSql(dishes: readonly CatalogDish[]): string {
  const rows = dishes.map(
    (d) =>
      `  (${[
        sqlText(d.key),
        sqlText(d.name_ta),
        sqlText(d.name_en),
        sqlTextArray(d.aliases),
        sqlText(d.type),
        sqlTextArray(d.meals),
        sqlTextArray(d.tags),
        `${sqlText(ingredientsJson(d))}::jsonb`,
        sqlTextArray(d.sides),
      ].join(', ')})`,
  )
  return `-- ============================================================================
-- PRABAS Food Planner · 0007 starter dish catalogue
--
-- GENERATED by \`npm run catalog\` from supabase/seed/dish_catalog.psv.
-- Edit that file, not this one. (${dishes.length} dishes.)
--
-- Loads the catalogue, then gives every existing household its own copy.
-- Safe to run again: existing catalogue rows are updated, and households only
-- get dishes they don't already have.
-- ============================================================================

insert into private.dish_catalog (key, name_ta, name_en, aliases, type, meals, tags, ingredients, sides) values
${rows.join(',\n')}
on conflict (key) do update set
  name_ta = excluded.name_ta, name_en = excluded.name_en, aliases = excluded.aliases,
  type = excluded.type, meals = excluded.meals, tags = excluded.tags,
  ingredients = excluded.ingredients, sides = excluded.sides;

select private.seed_household_dishes(id) from public.households;
`
}

const TYPE_TITLES: Record<DishType, string> = {
  tiffin: 'Tiffin',
  variety_rice: 'Variety rice',
  kuzhambu: 'Kuzhambu',
  sambar: 'Sambar',
  rasam: 'Rasam',
  poriyal: 'Poriyal',
  kootu: 'Kootu',
  chutney: 'Chutney',
  nonveg_gravy: 'Non-veg gravy',
  nonveg_fry: 'Non-veg fry',
  drink: 'Drink',
  snack: 'Snack',
  sweet: 'Sweet',
  juice: 'Juice and lassi',
  salad_soup: 'Salad and soup',
  prepared: 'Made ahead',
}

/** "500 g", "1.5 kg", "2 bunches", for the review docs. */
export function catalogAmount(q: number, unit: string): string {
  if (unit === 'g') return q >= 1000 ? `${q / 1000} kg` : `${q} g`
  if (unit === 'ml') return q >= 1000 ? `${q / 1000} l` : `${q} ml`
  return `${q} ${unit}${q === 1 ? '' : unit === 'bunch' ? 'es' : 's'}`
}

/** "Idli rice 2 kg", "Small onion 75 g (optional)". */
export function catalogIngredientText(i: CatalogIngredient, itemsByKey: ReadonlyMap<string, Pick<CatalogItem, 'name_en' | 'unit'>>): string {
  const item = itemsByKey.get(i.item)
  return `${item?.name_en ?? i.item} ${catalogAmount(i.quantity, item?.unit ?? '')}${i.optional ? ' (optional)' : ''}`
}

/** The review table, grouped by type: names, meals, ingredients for five, and sides. */
export function dishCatalogToMarkdown(dishes: readonly CatalogDish[], items: readonly CatalogItem[]): string {
  const cell = (s: string) => s.replace(/\|/g, '\\|')
  const itemsByKey = new Map(items.map((i) => [i.key, i]))
  const dishesByKey = new Map(dishes.map((d) => [d.key, d]))
  const ingredient = (i: CatalogIngredient) => catalogIngredientText(i, itemsByKey)
  const sections = DISH_TYPES.map((t) => {
    const rows = dishes.filter((d) => d.type === t)
    if (!rows.length) return ''
    return [
      `## ${TYPE_TITLES[t]} (${rows.length})`,
      '',
      '| Tamil | English | Veg | Meals | Ingredients for 5 | Sides | Tags |',
      '|---|---|---|---|---|---|---|',
      ...rows.map((d) =>
        [
          '',
          cell(d.name_ta),
          cell(d.name_en),
          catalogDishIsVeg(d, itemsByKey) ? 'veg' : '**non-veg**',
          d.meals.join(', '),
          cell(d.ingredients.map(ingredient).join(', ')),
          cell(d.sides.map((s) => dishesByKey.get(s)?.name_en ?? s).join(', ')),
          d.tags.join(', '),
          '',
        ].join(' | ').trim(),
      ),
      '',
    ].join('\n')
  }).filter(Boolean)
  return `# Starter dish catalogue (${dishes.length} dishes)

Generated by \`npm run catalog\` from \`supabase/seed/dish_catalog.psv\`. To change a dish,
edit that file (one dish per line), run \`npm run catalog\`, and commit both.

Please check: Tamil spellings, the quantities (**for five people**; starting estimates,
editable in the app), which meals each dish suits, and the sides, best first. Salt,
mustard seeds, turmeric and asafoetida are left out: they're used in almost everything
in small amounts.

${sections.join('\n')}`
}
