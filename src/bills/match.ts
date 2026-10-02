// Matching a bill line's name to one of the household's items: what this shop's word
// meant last time, then the household's own mappings, then names and aliases, then
// typos and misreads, then the closest guesses. Ambiguous words always ask.

import { editDistance, fold, searchItems } from '../stock/search.ts'
import type { Item } from '../stock/types.ts'

export type MatchKind = 'vendor' | 'household' | 'exact' | 'fuzzy' | 'guess' | 'unknown'

/** A name mapped by hand once, remembered for next time. */
export interface BillAlias {
  /** Normalised shop name, or '' for any shop. */
  vendor: string
  /** Normalised bill text. */
  raw: string
  item_id: string
}

export interface Match {
  item: Item | null
  kind: MatchKind
  /** sure: matched. check: worth a look (one tap to accept). none: needs mapping. */
  confidence: 'sure' | 'check' | 'none'
  /** For a line that needs a look: the closest items, best first. */
  guesses: Item[]
  /** A word that means different things at different shops (beans, chilli, greens…). */
  ambiguous: boolean
}

/** Words that mean different things at different shops: always asked, unless this shop's meaning is known. */
export const AMBIGUOUS = ['beans', 'chilli', 'chili', 'milagai', 'greens', 'keerai', 'dal', 'paruppu', 'rice', 'arisi', 'oil', 'ennai', 'podi', 'கீரை', 'மிளகாய்', 'பருப்பு', 'அரிசி', 'எண்ணெய்', 'பொடி'] as const
const AMBIGUOUS_KEYS = new Set(AMBIGUOUS.map((w) => fold(w)))

/** Bill text as a matching key: Tanglish folded, stray symbols and filler words gone. */
export function normaliseName(name: string): string {
  return fold(name.replace(/\b(fresh|nattu|country|local|loose|new|big|small|org(anic)?)\b/gi, ' ')).replace(/\s+/g, ' ').trim()
}

export const normaliseVendor = (vendor: string) => fold(vendor)

/** The fuzzy rule search uses: one edit for 5–7 letters, two from 8. */
const maxEdits = (key: string) => (key.length >= 8 ? 2 : key.length >= 5 ? 1 : 0)

/** How many guesses a line that needs a look shows. */
export const GUESSES = 3

export function matchLine(
  name: string,
  { items, aliases, vendor }: { items: readonly Item[]; aliases: readonly BillAlias[]; vendor: string },
): Match {
  const live = items.filter((i) => !i.archived)
  const byId = new Map(live.map((i) => [i.id, i]))
  const key = normaliseName(name)
  const none: Match = { item: null, kind: 'unknown', confidence: 'none', guesses: [], ambiguous: false }
  if (!key) return none
  const ambiguous = AMBIGUOUS_KEYS.has(key)

  // This shop's word, as mapped before: trusted even for ambiguous words.
  const shop = normaliseVendor(vendor)
  const fromShop = shop ? aliases.find((a) => a.vendor === shop && a.raw === key && byId.has(a.item_id)) : undefined
  if (fromShop) return { ...none, item: byId.get(fromShop.item_id)!, kind: 'vendor', confidence: 'sure', ambiguous }

  const guesses = () => searchItems(live, key).slice(0, GUESSES)
  // Beans, chilli, greens: which one depends on the shop. Ask.
  if (ambiguous) return { ...none, guesses: guesses(), ambiguous }

  const fromHousehold = aliases.find((a) => a.vendor === '' && a.raw === key && byId.has(a.item_id))
  if (fromHousehold) return { ...none, item: byId.get(fromHousehold.item_id)!, kind: 'household', confidence: 'sure' }

  const names = (i: Item) => [i.name_en, i.name_ta, ...i.aliases].map(fold).filter(Boolean)
  const exact = live.filter((i) => names(i).includes(key))
  if (exact.length === 1) return { ...none, item: exact[0], kind: 'exact', confidence: 'sure' }
  if (exact.length > 1) return { ...none, item: exact[0], kind: 'exact', confidence: 'check', guesses: exact.slice(0, GUESSES) }

  // Typos and misreads ("tomatto", "brinjai"): the closest by edits.
  const max = maxEdits(key)
  if (max > 0) {
    const scored = live
      .map((i) => ({ i, d: Math.min(...names(i).map((n) => editDistance(key, n, max))) }))
      .filter((x) => x.d <= max)
      .sort((a, b) => a.d - b.d)
    if (scored.length) {
      const best = scored[0]
      const tied = scored.filter((x) => x.d === best.d).length > 1
      // One clear match, one edit away: sure. Further, or a tie: worth a look.
      const confidence = !tied && best.d <= 1 ? 'sure' : 'check'
      return { ...none, item: best.i, kind: 'fuzzy', confidence, guesses: scored.slice(0, GUESSES).map((x) => x.i) }
    }
  }

  const g = guesses()
  if (g.length) return { ...none, item: g[0], kind: 'guess', confidence: 'check', guesses: g }
  return none
}
