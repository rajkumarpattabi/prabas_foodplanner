// The prepared catalogue: parsed from supabase/seed/prepared.psv. `npm run catalog`
// turns it into migration 0012 and the review table in docs/PREPARED.md. Runs in Node
// too (scripts/build-catalog.ts), so it uses no browser or app imports.

import {
  catalogIngredientsJson,
  catalogIngredientText,
  list,
  parseCatalogIngredients,
  type CatalogDish,
  type CatalogIngredient,
} from '../dishes/catalog.ts'
import { DISH_TAGS, DISH_TYPES, MEALS, type DishTag, type DishType, type Meal } from '../dishes/types.ts'
import type { CatalogItem } from '../stock/catalog.ts'
import { STAGE_LABELS } from './plan.ts'
import { STAGE_KEYS, type BatchUnit, type PrepStage, type StageKey } from './types.ts'

/** Something made ahead. `dish` is set for a new dish; null adds a plan to a catalogue dish. */
export interface CatalogPrepared {
  key: string
  dish: { name_ta: string; name_en: string; type: DishType; meals: Meal[]; tags: DishTag[]; aliases: string[] } | null
  stages: PrepStage[]
  yield: number
  unit: BatchUnit
  keeps_days: number
  keep_going: boolean
  ingredients: CatalogIngredient[]
}

export interface CatalogUse {
  /** A prepared key. */
  dish: string
  quantity: number
  optional: boolean
  prefers_aged: boolean
}

/** A dish that uses prepared items: what it uses, its own ingredients from now on, and sides to add. */
export interface CatalogDishChange {
  dish: string
  uses: CatalogUse[]
  ingredients: CatalogIngredient[]
  add_sides: string[]
}

export interface PreparedCatalog {
  prepared: CatalogPrepared[]
  changes: CatalogDishChange[]
}

export const PREPARED_COLUMNS = ['key', 'name_ta', 'name_en', 'type', 'meals', 'tags', 'stages', 'yield', 'unit', 'keeps', 'keep_going', 'ingredients', 'aliases'] as const
export const CHANGE_COLUMNS = ['dish', 'uses', 'ingredients', 'add_sides'] as const

function parseStages(text: string, where: string): PrepStage[] {
  return list(text).map((entry) => {
    const [key, hours, ...flags] = entry.split(':')
    const h = Number(hours)
    if (!STAGE_KEYS.includes(key as StageKey) || hours === undefined || !(h >= 0)) {
      throw new Error(`${where}: stage "${entry}" should look like soak:8 (stages: ${STAGE_KEYS.join(', ')})`)
    }
    for (const f of flags) if (!['wait', 'takes', 'adjust'].includes(f)) throw new Error(`${where}: stage "${entry}" has an unknown flag "${f}"`)
    return {
      key: key as StageKey,
      hours: h,
      action: !flags.includes('wait'),
      ...(flags.includes('takes') ? { takes_ingredients: true } : {}),
      ...(flags.includes('adjust') ? { adjustable: true } : {}),
    }
  })
}

/**
 * Two tables, each with its own header line: the prepared items, then the dishes that
 * use them. Throws with the line number on anything invalid.
 */
export function parsePreparedCatalog(text: string): PreparedCatalog {
  const prepared: CatalogPrepared[] = []
  const changes: CatalogDishChange[] = []
  let section: 'prepared' | 'changes' | null = null
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim()
    if (!line || line.startsWith('#')) return
    const cells = line.split('|').map((c) => c.trim())
    const where = `prepared.psv line ${i + 1}`
    if (cells.join('|') === PREPARED_COLUMNS.join('|')) return void (section = 'prepared')
    if (cells.join('|') === CHANGE_COLUMNS.join('|')) return void (section = 'changes')
    if (section === null) throw new Error(`${where}: expected a header line first`)
    const columns = section === 'prepared' ? PREPARED_COLUMNS : CHANGE_COLUMNS
    if (cells.length !== columns.length) throw new Error(`${where}: expected ${columns.length} columns, got ${cells.length}`)

    if (section === 'prepared') {
      const [key, name_ta, name_en, type, meals, tags, stages, yieldText, unit, keeps, keepGoing, ingredients, aliases] = cells
      if (!/^[a-z0-9_]+$/.test(key)) throw new Error(`${where}: key "${key}" must be lower case letters, digits, or _`)
      let dish: CatalogPrepared['dish'] = null
      if (name_ta || name_en || type || meals || tags || aliases) {
        if (!/[஀-௿]/.test(name_ta)) throw new Error(`${where}: name_ta "${name_ta}" has no Tamil script`)
        if (!name_en) throw new Error(`${where}: name_en is empty`)
        if (!DISH_TYPES.includes(type as DishType)) throw new Error(`${where}: unknown type "${type}"`)
        for (const m of list(meals)) if (!MEALS.includes(m as Meal)) throw new Error(`${where}: unknown meal "${m}"`)
        if (type !== 'prepared' && !list(meals).length) throw new Error(`${where}: something eaten as it is needs a meal`)
        for (const t of list(tags)) if (!DISH_TAGS.includes(t as DishTag)) throw new Error(`${where}: unknown tag "${t}"`)
        dish = { name_ta, name_en, type: type as DishType, meals: list(meals) as Meal[], tags: list(tags) as DishTag[], aliases: list(aliases) }
      }
      const y = Number(yieldText)
      const k = Number(keeps)
      if (!(y > 0)) throw new Error(`${where}: yield "${yieldText}" should be a number above 0`)
      if (unit !== 'meals' && unit !== 'glasses') throw new Error(`${where}: unit should be meals or glasses`)
      if (!(k >= 0)) throw new Error(`${where}: keeps "${keeps}" should be a number of days`)
      if (keepGoing !== 'yes' && keepGoing !== 'no') throw new Error(`${where}: keep_going should be yes or no`)
      prepared.push({
        key,
        dish,
        stages: parseStages(stages, where),
        yield: y,
        unit,
        keeps_days: k,
        keep_going: keepGoing === 'yes',
        ingredients: parseCatalogIngredients(ingredients, where),
      })
      return
    }

    const [dish, uses, ingredients, addSides] = cells
    changes.push({
      dish,
      uses: list(uses).map((entry) => {
        const [key, q, ...flags] = entry.split(':')
        const quantity = Number(q)
        if (!/^[a-z0-9_]+$/.test(key) || !(quantity > 0)) throw new Error(`${where}: use "${entry}" should look like idli_dosa_batter:1`)
        for (const f of flags) if (f !== 'optional' && f !== 'aged') throw new Error(`${where}: use "${entry}" has an unknown flag "${f}"`)
        return { dish: key, quantity, optional: flags.includes('optional'), prefers_aged: flags.includes('aged') }
      }),
      ingredients: parseCatalogIngredients(ingredients, where),
      add_sides: list(addSides),
    })
  })
  return { prepared, changes }
}

/** Everything that would make it wrong, as readable messages. Empty when it's fine. */
export function checkPreparedCatalog(cat: PreparedCatalog, dishes: readonly CatalogDish[], items: readonly CatalogItem[]): string[] {
  const errors: string[] = []
  const itemKeys = new Set(items.map((i) => i.key))
  const dishKeys = new Set(dishes.map((d) => d.key))
  const preparedKeys = new Set<string>()
  for (const p of cat.prepared) {
    if (preparedKeys.has(p.key)) errors.push(`${p.key}: listed twice`)
    preparedKeys.add(p.key)
    if (p.dish && dishKeys.has(p.key)) errors.push(`${p.key}: already a catalogue dish; leave its name and type empty`)
    if (!p.dish && !dishKeys.has(p.key)) errors.push(`${p.key}: not a catalogue dish, so it needs a name and type`)
    if (!p.stages.length) errors.push(`${p.key}: no stages`)
    else if (!p.stages[0].action) errors.push(`${p.key}: the first stage has to be something to do`)
    if (p.stages.filter((s) => s.takes_ingredients).length !== 1) errors.push(`${p.key}: exactly one stage takes the ingredients`)
    if (p.stages.filter((s) => s.adjustable).length > 1) errors.push(`${p.key}: only one stage can be adjusted`)
    if (!p.ingredients.length) errors.push(`${p.key}: no ingredients`)
    for (const i of p.ingredients) if (!itemKeys.has(i.item)) errors.push(`${p.key}: ingredient "${i.item}" isn't in the item catalogue`)
  }
  const allDishes = new Set([...dishKeys, ...cat.prepared.filter((p) => p.dish).map((p) => p.key)])
  const changed = new Set<string>()
  for (const c of cat.changes) {
    if (changed.has(c.dish)) errors.push(`${c.dish}: changed twice`)
    changed.add(c.dish)
    if (!allDishes.has(c.dish)) errors.push(`${c.dish}: isn't a dish`)
    if (!c.uses.length) errors.push(`${c.dish}: uses nothing prepared`)
    for (const u of c.uses) if (!preparedKeys.has(u.dish)) errors.push(`${c.dish}: uses "${u.dish}", which isn't made ahead`)
    for (const i of c.ingredients) if (!itemKeys.has(i.item)) errors.push(`${c.dish}: ingredient "${i.item}" isn't in the item catalogue`)
    for (const s of c.add_sides) if (!allDishes.has(s)) errors.push(`${c.dish}: side "${s}" isn't a dish`)
  }
  // Something eaten as it is has to say how much of itself a meal takes.
  for (const p of cat.prepared) {
    const eaten = p.dish ? p.dish.type !== 'prepared' : true
    if (eaten && !cat.changes.some((c) => c.dish === p.key && c.uses.some((u) => u.dish === p.key))) {
      errors.push(`${p.key}: is eaten as it is, so it needs a line below using itself`)
    }
  }
  return errors
}

const sqlText = (s: string) => `'${s.replace(/'/g, "''")}'`
const sqlTextArray = (xs: readonly string[]) => `array[${xs.map(sqlText).join(', ')}]::text[]`
const jsonb = (v: unknown) => `${sqlText(typeof v === 'string' ? v : JSON.stringify(v))}::jsonb`

/** The plan as the catalogue stores it: ingredients name item keys. */
const planJson = (p: CatalogPrepared) =>
  jsonb({
    stages: p.stages,
    yield: p.yield,
    unit: p.unit,
    keeps_days: p.keeps_days,
    keep_going: p.keep_going,
    ingredients: JSON.parse(catalogIngredientsJson(p.ingredients)),
  })
const usesJson = (uses: readonly CatalogUse[]) =>
  jsonb(uses.map((u) => ({ dish: u.dish, quantity: u.quantity, ...(u.optional ? { optional: true } : {}), ...(u.prefers_aged ? { prefers_aged: true } : {}) })))

/** Migration 0012: the prepared catalogue, for new households and ones that exist. */
export function preparedCatalogToSql(cat: PreparedCatalog, dishes: readonly CatalogDish[]): string {
  const byKey = new Map(dishes.map((d) => [d.key, d]))
  const changeOf = new Map(cat.changes.map((c) => [c.dish, c]))
  const fresh = cat.prepared.filter((p) => p.dish)
  const planned = cat.prepared.filter((p) => !p.dish)

  const freshRows = fresh.map((p) => {
    const d = p.dish!
    const c = changeOf.get(p.key)
    return `  (${[
      sqlText(p.key),
      sqlText(d.name_ta),
      sqlText(d.name_en),
      sqlTextArray(d.aliases),
      sqlText(d.type),
      sqlTextArray(d.meals),
      sqlTextArray(d.tags),
      jsonb(catalogIngredientsJson(c?.ingredients ?? [])),
      sqlTextArray(c?.add_sides ?? []),
      planJson(p),
      usesJson(c?.uses ?? []),
    ].join(', ')})`
  })

  // Starter dishes that change: in the catalogue (for new households), then in each
  // household, only where the dish still has its starter ingredients.
  const changed = cat.changes.filter((c) => byKey.has(c.dish))
  const catalogUpdates = changed.map((c) => {
    const d = byKey.get(c.dish)!
    const plan = planned.find((p) => p.key === c.dish)
    return `update private.dish_catalog set
  ingredients = ${jsonb(catalogIngredientsJson(c.ingredients))},
  uses = ${usesJson(c.uses)},
  sides = ${sqlTextArray([...d.sides, ...c.add_sides.filter((s) => !d.sides.includes(s))])}${plan ? `,\n  prep_plan = ${planJson(plan)}` : ''}
where key = ${sqlText(c.dish)};`
  })
  const householdUpdates = changed.map((c) => {
    const d = byKey.get(c.dish)!
    const plan = planned.find((p) => p.key === c.dish)
    const lines = [
      `-- ${d.name_en}`,
      `update public.dishes d set
  ingredients = private.catalog_ingredients(d.household_id, ${jsonb(catalogIngredientsJson(c.ingredients))}),
  uses_prepared = private.catalog_uses(d.household_id, ${usesJson(c.uses)})${plan ? `,\n  prep_plan = coalesce(d.prep_plan, private.catalog_prep_plan(d.household_id, ${planJson(plan)}))` : ''}
where d.catalog_key = ${sqlText(c.dish)}
  and d.ingredients = private.catalog_ingredients(d.household_id, ${jsonb(catalogIngredientsJson(d.ingredients))});`,
    ]
    if (c.add_sides.length) {
      lines.push(`update public.dishes d set side_ids = d.side_ids || array(
  select s.id from unnest(${sqlTextArray(c.add_sides)}) with ordinality as k (key, ord)
  join public.dishes s on s.household_id = d.household_id and s.catalog_key = k.key
  where not s.id = any (d.side_ids) and s.id <> d.id
  order by k.ord)
where d.catalog_key = ${sqlText(c.dish)} and cardinality(d.side_ids) < 9;`)
    }
    return lines.join('\n')
  })

  return `-- ============================================================================
-- PRABAS Food Planner · 0012 prepared catalogue
--
-- GENERATED by \`npm run catalog\` from supabase/seed/prepared.psv (and the starter
-- dishes in dish_catalog.psv). Edit those files, not this one.
-- (${cat.prepared.length} prepared items, ${cat.changes.length} dishes that use them.)
--
-- The catalogue gains prep plans and uses; new households get them with their dishes.
-- Every existing household gets the new items. Its starter dishes that now use one
-- (dosa uses batter) change only if they still have their starter ingredients: a dish
-- someone has edited is left as it is.
-- ============================================================================

alter table private.dish_catalog
  add column if not exists prep_plan jsonb,
  -- [{dish: <dish catalogue key>, quantity, optional?, prefers_aged?}]
  add column if not exists uses jsonb not null default '[]';

-- Catalogue ingredients ([{item: key, quantity, optional?}]) as a household's own
-- ([{item_id, quantity, optional?}]). The same mapping as seeding in 0006, so a starter
-- dish nobody has edited compares equal.
create or replace function private.catalog_ingredients(p_household uuid, p_list jsonb) returns jsonb
language sql stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(
           jsonb_build_object('item_id', i.id, 'quantity', (x.v ->> 'quantity')::numeric)
           || case when (x.v ->> 'optional')::boolean then '{"optional": true}'::jsonb else '{}'::jsonb end
           order by x.ord), '[]'::jsonb)
  from jsonb_array_elements(coalesce(p_list, '[]'::jsonb)) with ordinality as x (v, ord)
  join public.items i on i.household_id = p_household and i.catalog_key = x.v ->> 'item'
$$;

-- Catalogue uses ([{dish: key, …}]) as a household's ([{dish_id, …}]).
create or replace function private.catalog_uses(p_household uuid, p_list jsonb) returns jsonb
language sql stable
set search_path = ''
as $$
  select coalesce(jsonb_agg((x.v - 'dish') || jsonb_build_object('dish_id', d.id) order by x.ord), '[]'::jsonb)
  from jsonb_array_elements(coalesce(p_list, '[]'::jsonb)) with ordinality as x (v, ord)
  join public.dishes d on d.household_id = p_household and d.catalog_key = x.v ->> 'dish'
$$;

create or replace function private.catalog_prep_plan(p_household uuid, p_plan jsonb) returns jsonb
language sql stable
set search_path = ''
as $$
  select case when p_plan is null then null
    else p_plan || jsonb_build_object('ingredients', private.catalog_ingredients(p_household, p_plan -> 'ingredients')) end
$$;

-- Copies catalogue dishes into a household. Same as 0006, plus prep plans, and what
-- each newly added dish uses (filled in after, like sides, once every dish is there).
create or replace function private.seed_household_dishes(p_household uuid) returns int
language plpgsql
set search_path = ''
as $$
declare
  added uuid[];
begin
  with ins as (
    insert into public.dishes (
      household_id, catalog_key, name_ta, name_en, aliases, type, meals, tags,
      ingredients, is_veg, prep_plan, notes, created_by, updated_by
    )
    select
      p_household, c.key, c.name_ta, c.name_en, c.aliases, c.type, c.meals, c.tags,
      private.catalog_ingredients(p_household, c.ingredients),
      not exists (
        select 1
        from jsonb_array_elements(c.ingredients) x (v)
        join public.items i on i.household_id = p_household and i.catalog_key = x.v ->> 'item'
        where i.category in ('meat', 'fish', 'egg')
      ),
      private.catalog_prep_plan(p_household, c.prep_plan),
      c.notes, null, null
    from private.dish_catalog c
    on conflict (household_id, catalog_key) do nothing
    returning id
  )
  select coalesce(array_agg(id), '{}') into added from ins;

  update public.dishes d
  set side_ids = coalesce((
    select array_agg(s.id order by k.ord)
    from unnest(c.sides) with ordinality as k (key, ord)
    join public.dishes s on s.household_id = p_household and s.catalog_key = k.key and s.id <> d.id
  ), '{}')
  from private.dish_catalog c
  where d.id = any (added) and d.catalog_key = c.key and cardinality(c.sides) > 0;

  update public.dishes d
  set uses_prepared = private.catalog_uses(p_household, c.uses)
  from private.dish_catalog c
  where d.id = any (added) and d.catalog_key = c.key and jsonb_array_length(c.uses) > 0;

  return cardinality(added);
end
$$;

-- ---------------------------------------------------------------------------
-- The catalogue: new prepared items, then the starter dishes that use them.
-- ---------------------------------------------------------------------------

insert into private.dish_catalog (key, name_ta, name_en, aliases, type, meals, tags, ingredients, sides, prep_plan, uses) values
${freshRows.join(',\n')}
on conflict (key) do update set
  name_ta = excluded.name_ta, name_en = excluded.name_en, aliases = excluded.aliases,
  type = excluded.type, meals = excluded.meals, tags = excluded.tags,
  ingredients = excluded.ingredients, sides = excluded.sides,
  prep_plan = excluded.prep_plan, uses = excluded.uses;

${catalogUpdates.join('\n\n')}

-- ---------------------------------------------------------------------------
-- Households that exist: the new items, then their starter dishes.
-- ---------------------------------------------------------------------------

select private.seed_household_dishes(id) from public.households;

${householdUpdates.join('\n\n')}
`
}

const cell = (s: string) => s.replace(/\|/g, '\\|')
const hours = (h: number) => (h === 0 ? '' : h < 1 ? ` ${h * 60} min` : ` ${h} h`)

/** "Soak 5 h · grind · ferment 10 h (adjustable)". */
export function stagesText(stages: readonly PrepStage[]): string {
  return stages
    .map((s, i) => {
      const verb = STAGE_LABELS[s.key].verb
      return `${i === 0 ? verb : verb.toLowerCase()}${hours(s.hours)}${s.adjustable ? ' (adjustable)' : ''}`
    })
    .join(' · ')
}

/** The review tables: what's made ahead, and which dishes use it. */
export function preparedCatalogToMarkdown(cat: PreparedCatalog, dishes: readonly CatalogDish[], items: readonly CatalogItem[]): string {
  const itemsByKey = new Map(items.map((i) => [i.key, i]))
  const byKey = new Map(dishes.map((d) => [d.key, d]))
  const nameOf = (key: string) => byKey.get(key)?.name_en ?? cat.prepared.find((p) => p.key === key)?.dish?.name_en ?? key
  const unit = (n: number, u: BatchUnit) => `${n} ${u === 'meals' ? (n === 1 ? 'meal' : 'meals') : n === 1 ? 'glass' : 'glasses'}`
  const ingredients = (list: readonly CatalogIngredient[]) => cell(list.map((i) => catalogIngredientText(i, itemsByKey)).join(', ') || 'nothing else')

  const made = cat.prepared.map((p) =>
    [
      '',
      cell(p.dish?.name_ta ?? byKey.get(p.key)?.name_ta ?? ''),
      cell(nameOf(p.key)),
      stagesText(p.stages),
      unit(p.yield, p.unit),
      `${p.keeps_days} ${p.keeps_days === 1 ? 'day' : 'days'}`,
      p.keep_going ? 'yes' : '',
      ingredients(p.ingredients),
      '',
    ]
      .join(' | ')
      .trim(),
  )
  const uses = cat.changes.map((c) => {
    const before = byKey.get(c.dish)
    return [
      '',
      cell(nameOf(c.dish)),
      cell(c.uses.map((u) => `${unit(u.quantity, cat.prepared.find((p) => p.key === u.dish)?.unit ?? 'meals')} of ${nameOf(u.dish).toLowerCase()}${u.prefers_aged ? ' (better older)' : ''}${u.optional ? ' (optional)' : ''}`).join(', ')),
      ingredients(c.ingredients),
      before ? ingredients(before.ingredients) : 'new',
      cell(c.add_sides.map(nameOf).join(', ')),
      '',
    ]
      .join(' | ')
      .trim()
  })

  return `# Prepared items (${cat.prepared.length}) and the dishes that use them (${cat.changes.length})

Generated by \`npm run catalog\` from \`supabase/seed/prepared.psv\`. To change something,
edit that file, run \`npm run catalog\`, and commit both.

Please check: the stages and their times, how much one batch makes, how long it keeps,
and the amounts for one batch. A batch's ingredients are taken from stock once, at the
stage that takes them (soaking, kneading or cooking), never again when cooking with it.

## Made ahead

| Tamil | English | Stages | One batch makes | Keeps | Keep it going | Ingredients for one batch |
|---|---|---|---|---|---|---|
${made.join('\n')}

Times are until the next stage. Nobody is asked to soak or grind between 10 pm and
6 am: planning backwards moves such a step to 9 pm the evening before.

## Dishes that use them

Their own ingredients change to the "From now on" list (for five), because the rest is
in the prepared item. A starter dish someone has already edited is left as it is.

| Dish | Uses, per meal | From now on | Before | Sides added |
|---|---|---|---|---|
${uses.join('\n')}

Chana sundal is left as it is: it uses black chickpeas, and the soaked chana here is white.
`
}
