// The Meals section of the CSV export: the meal history, readable in a spreadsheet.

type Row = Record<string, unknown>

export const MEAL_CSV_COLUMNS = [
  { key: 'date', label: 'date' },
  { key: 'meal', label: 'meal' },
  { key: 'dishes_ta', label: 'dishes_ta' },
  { key: 'dishes_en', label: 'dishes_en' },
  { key: 'status', label: 'status' },
  { key: 'planned_by', label: 'planned_by' },
  { key: 'cooked_by', label: 'cooked_by' },
] as const

const MEAL_ORDER: Record<string, number> = { breakfast: 0, lunch: 1, dinner: 2 }

/**
 * One row per meal, with its dishes (as named when planned or cooked) and who planned
 * and cooked it. Rows keep a `sort` key: by date, then breakfast, lunch, dinner.
 */
export function mealCsvRows(tables: Record<string, Row[]>): Row[] {
  const names = new Map((tables.profiles ?? []).map((p) => [String(p.user_id), String(p.display_name ?? '')]))
  const who = (id: unknown) => (typeof id === 'string' && names.get(id)) || ''
  return (tables.meals ?? []).map((m) => {
    const dishes = (Array.isArray(m.dish_names) ? m.dish_names : []) as { name_ta?: string; name_en?: string }[]
    return {
      sort: `${m.date}:${MEAL_ORDER[String(m.meal)] ?? 9}`,
      date: m.date,
      meal: m.meal,
      dishes_ta: dishes.map((d) => d.name_ta ?? '').join(' + '),
      dishes_en: dishes.map((d) => d.name_en ?? '').join(' + '),
      status: m.status,
      planned_by: who(m.created_by),
      cooked_by: m.status === 'cooked' ? who(m.cooked_by) : '',
    }
  })
}
