// Shopping-list nudges: at most two, for the biggest gaps that buying something fixes,
// each with a one-tap add and a dish idea. "No keerai in 10 days. Add murungai keerai?"

import { isRestricted } from '../calendar/rules.ts'
import type { CalendarDay } from '../calendar/types.ts'
import type { Dish } from '../dishes/types.ts'
import type { LocalDate } from '../lib/dates.ts'
import type { DishHistory } from '../plan/history.ts'
import type { StockRow } from '../stock/view.ts'
import type { Item } from '../stock/types.ts'
import { GROUP_WEIGHT, WINDOW_DAYS, type Gap, type Nutrition } from './balance.ts'
import { cover, type Group } from './groups.ts'

/** Never more than this many on the list. */
export const MAX_NUDGES = 2

export interface Nudge {
  group: Group
  /** "No keerai in 10 days." */
  text: string
  item: Item
  /** A dish that uses it, if there is one. */
  dish: Dish | null
}

export interface NudgeInput {
  nutrition: Nutrition
  today: LocalDate
  calendar: readonly CalendarDay[]
  rows: readonly StockRow[]
  /** Items on the list already. */
  listed: ReadonlySet<string>
  dishes: readonly Dish[]
  history: ReadonlyMap<string, DishHistory>
}

/** What the nudge says about the gap. */
export function gapText(gap: Gap): string {
  const none = (word: string) => (gap.daysSince === null ? `No ${word} in ${WINDOW_DAYS / 7} weeks.` : `No ${word} in ${gap.daysSince} days.`)
  switch (gap.group) {
    case 'greens':
      return gap.daysSince === null || gap.daysSince > 5 ? none('keerai') : 'Few greens this fortnight.'
    case 'millet':
      return gap.daysSince === null ? none('millets') : 'Few millets this fortnight.'
    case 'legume':
      return 'Few legumes this fortnight.'
    case 'protein':
      return 'Few protein-rich meals this fortnight.'
    case 'fish':
      return gap.daysSince === null ? none('fish') : 'Little fish this fortnight.'
    case 'curd':
      return 'Not much curd this fortnight.'
    case 'variety':
      return 'The same few vegetables lately.'
  }
}

export function shoppingNudges({ nutrition, today, calendar, rows, listed, dishes, history }: NudgeInput): Nudge[] {
  const gaps = [...nutrition.gaps].sort((a, b) => b.size * GROUP_WEIGHT[b.group] - a.size * GROUP_WEIGHT[a.group])
  const vegOnlyToday = isRestricted(today, calendar)
  const itemsById = new Map(rows.map((r) => [r.item.id, r.item]))
  const bought = (r: StockRow) => r.events.filter((e) => e.kind === 'delta' && e.quantity > 0).length
  const familiar = (a: Dish, b: Dish) =>
    Number(b.is_kids_favourite) - Number(a.is_kids_favourite) ||
    Number(b.is_favourite) - Number(a.is_favourite) ||
    (history.get(b.id)?.timesCooked ?? 0) - (history.get(a.id)?.timesCooked ?? 0) ||
    a.name_en.localeCompare(b.name_en)

  const out: Nudge[] = []
  const used = new Set<string>()
  for (const gap of gaps) {
    if (out.length >= MAX_NUDGES) break
    // Protein is best fixed with legumes; one nudge covers both.
    const group: Group = gap.group === 'protein' ? 'legume' : gap.group
    if (out.some((n) => n.group === group)) continue
    if (group === 'fish' && vegOnlyToday) continue
    // Dishes that fill the gap, and the items in them that buying would bring in.
    const filling = dishes.filter((d) => !d.dont_suggest && (group !== 'fish' || !vegOnlyToday) && cover([d], itemsById).groups.has(group))
    const fillsGap = rows
      .filter((r) => !r.item.archived)
      .filter((r) => {
        const c = r.item.category
        if (group === 'greens') return c === 'greens'
        if (group === 'fish') return c === 'fish'
        if (group === 'variety') return c === 'vegetable' && !nutrition.recentVegetables.has(r.item.id)
        // Only an item that fills the gap itself: a dal for legumes (not the rice in adai),
        // a millet for millets, curd for curd.
        const kind = group === 'legume' ? 'dal' : group === 'millet' ? 'grain' : 'dairy'
        return c === kind && filling.some((d) => d.ingredients.some((i) => i.item_id === r.item.id && !i.optional))
      })
    // Something that fills it is on the list or in the kitchen already: the gap is in hand.
    if (fillsGap.some((r) => listed.has(r.item.id) || r.stock.total > 0)) continue
    const candidates = fillsGap
      .filter((r) => !used.has(r.item.id))
      .map((r) => {
        const dish = filling.filter((d) => d.ingredients.some((i) => i.item_id === r.item.id && !i.optional)).sort(familiar)[0] ?? null
        return { r, dish }
      })
      .sort(
        (a, b) =>
          Number(!!b.dish) - Number(!!a.dish) ||
          bought(b.r) - bought(a.r) ||
          Number(!!b.dish?.is_kids_favourite) - Number(!!a.dish?.is_kids_favourite) ||
          a.r.item.name_en.localeCompare(b.r.item.name_en),
      )
    const pick = candidates[0]
    if (!pick) continue
    used.add(pick.r.item.id)
    out.push({ group, text: gapText(gap), item: pick.r.item, dish: pick.dish })
  }
  return out
}
