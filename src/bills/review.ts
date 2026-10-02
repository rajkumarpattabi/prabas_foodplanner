// The review screen's lines: each bill line with its item, how much (in the item's
// stored unit), which section it belongs in, and why. Sorted by attention needed.

import type { Item } from '../stock/types.ts'
import { toBase } from '../stock/units.ts'
import { perUnitText, pricePerUnit, quantityFromPrice, type PricedPurchase } from './estimate.ts'
import { matchLine, normaliseName, normaliseVendor, type BillAlias, type Match } from './match.ts'
import type { BillLine, ParsedBill } from './parse.ts'

/** map: needs mapping (red). check: worth a look (amber). matched: fine (green). other: not groceries. */
export type Section = 'map' | 'check' | 'matched' | 'other'

export const SECTION_ORDER: readonly Section[] = ['map', 'check', 'matched', 'other']

export interface ReviewLine {
  id: string
  line: BillLine
  match: Match
  item: Item | null
  /** In the item's stored unit; null until there's an item. */
  quantity: number | null
  section: Section
  /** Why it needs a look: "Read as Tomato?", "Estimated from ₹50/kg". */
  reasons: string[]
  /** Goes into stock on confirm. Lines that need a look wait for a tap. */
  include: boolean
  /** Chosen or accepted by hand: remembered as an alias for next time. */
  confirmed: boolean
}

export interface ReviewContext {
  items: readonly Item[]
  aliases: readonly BillAlias[]
  vendor: string
  /** Past purchases with prices, per item, for "Brinjal 40". */
  purchases: ReadonlyMap<string, readonly PricedPurchase[]>
  /** Items with a purchase today already (perhaps ticked off on Shop). */
  boughtToday: ReadonlySet<string>
}

const short = (n: number) => String(Math.round(n * 1000) / 1000)

/** How much, for this item, and whether it's a guess worth checking. */
function amountFor(line: BillLine, item: Item, ctx: ReviewContext): { quantity: number; check: string | null } {
  if (line.quantity !== null && line.unit) {
    const q = toBase(line.quantity, line.unit, item)
    if (q !== null && q > 0) return { quantity: q, check: null }
    return { quantity: item.step, check: 'Check the amount' }
  }
  if (line.quantity !== null) {
    // A bare number: a count for things counted, kilos or litres for the rest.
    if (item.unit === 'piece' || item.unit === 'bunch' || item.unit === 'packet') return { quantity: line.quantity, check: null }
    const unit = item.unit === 'ml' ? 'l' : 'kg'
    const q = toBase(line.quantity, unit, item)
    if (q !== null) return { quantity: q, check: `Check the amount: taken as ${short(line.quantity)} ${unit}` }
  }
  if (line.price !== null) {
    const per = pricePerUnit(ctx.purchases.get(item.id) ?? [])
    if (per !== null) return { quantity: quantityFromPrice(line.price, per, item), check: `Estimated from ${perUnitText(per, item)}` }
  }
  return { quantity: item.step, check: 'How much? Check the amount' }
}

/** One line, given its match (or an item chosen by hand). */
export function reviewLine(id: string, line: BillLine, match: Match, ctx: ReviewContext, chosen?: Item): ReviewLine {
  const base: ReviewLine = { id, line, match, item: null, quantity: null, section: 'other', reasons: [], include: false, confirmed: false }
  if (line.other) return base
  // An ambiguous word comes back with no item, unless this shop's meaning is known.
  const item = chosen ?? (match.confidence === 'none' ? null : match.item)
  if (!item) {
    return {
      ...base,
      section: 'map',
      reasons: [match.ambiguous ? `“${line.name}” can mean more than one thing. Which one?` : 'Not matched'],
    }
  }
  const { quantity, check } = amountFor(line, item, ctx)
  const reasons: string[] = []
  if (!chosen && match.confidence === 'check') reasons.push(match.kind === 'guess' ? 'Best guess' : `Read as ${item.name_en}?`)
  if (check) reasons.push(check)
  const twice = ctx.boughtToday.has(item.id)
  if (twice) reasons.push('Bought today already?')
  const sure = reasons.length === 0
  return { ...base, item, quantity, section: sure ? 'matched' : 'check', reasons, include: sure, confirmed: !!chosen }
}

/** Every line of the bill, sorted by attention needed (bill order within a section). */
export function reviewLines(bill: ParsedBill, ctx: ReviewContext): ReviewLine[] {
  const lines = bill.lines.map((line, i) => reviewLine(`l${i}`, line, line.other ? { item: null, kind: 'unknown', confidence: 'none', guesses: [], ambiguous: false } : matchLine(line.name, ctx), ctx))
  return sortLines(lines)
}

export const sortLines = (lines: readonly ReviewLine[]) =>
  [...lines].sort((a, b) => SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section) || Number(a.id.slice(1)) - Number(b.id.slice(1)))

/** What was done to a line on the review screen. */
export interface Choice {
  /** Picked by hand (from the guesses or a search). */
  item?: Item
  /** Ticked or unticked. */
  include?: boolean
}

/**
 * The lines with what was chosen applied. A line stays in the section it started in, so
 * nothing jumps about while you work down the list. A picked item is ticked; ticking a
 * line that was a guess or a misread accepts it, and it's remembered for next time.
 */
export function withChoices(lines: readonly ReviewLine[], choices: ReadonlyMap<string, Choice>, ctx: ReviewContext): ReviewLine[] {
  return lines.map((l) => {
    const c = choices.get(l.id)
    if (!c) return l
    let next = l
    if (c.item) next = { ...reviewLine(l.id, l.line, l.match, ctx, c.item), section: l.section, include: true }
    if (c.include !== undefined) {
      const include = c.include && next.item !== null
      next = { ...next, include, confirmed: next.confirmed || (include && l.match.confidence === 'check') }
    }
    return next
  })
}

/**
 * The mappings to remember: every line chosen or accepted by hand, for this shop and
 * for the household. Ambiguous words are remembered for this shop only.
 */
export function aliasesToSave(lines: readonly ReviewLine[], vendor: string): BillAlias[] {
  const shop = normaliseVendor(vendor)
  const out = new Map<string, BillAlias>()
  for (const l of lines) {
    if (!l.include || !l.confirmed || !l.item) continue
    const raw = normaliseName(l.line.name)
    if (!raw) continue
    if (shop) out.set(`${shop}|${raw}`, { vendor: shop, raw, item_id: l.item.id })
    if (!l.match.ambiguous) out.set(`|${raw}`, { vendor: '', raw, item_id: l.item.id })
  }
  return [...out.values()]
}
