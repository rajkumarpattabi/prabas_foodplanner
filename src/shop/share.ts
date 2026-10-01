// The list as plain text, for WhatsApp: both scripts, the chosen one first.

import { formatDay, type LocalDate } from '../lib/dates.ts'
import type { ScriptPref } from '../lib/database.types.ts'
import { namePair } from '../lib/names.ts'
import { formatQuantity } from '../stock/units.ts'
import type { NonVegNudge, ShopLine } from './build.ts'
import { SECTIONS, type SectionKey } from './types.ts'

export const SECTION_TITLES: Record<SectionKey, string> = {
  low: 'Running low',
  planned: 'For planned meals',
  maybe: 'Might need',
  added: 'Added',
}

export function shareText(lines: readonly ShopLine[], nudges: readonly NonVegNudge[], today: LocalDate, pref: ScriptPref): string {
  const line = (l: ShopLine) => {
    const [first, second] = namePair(l.item, pref)
    return `• ${first} ${second}${l.quantity !== null ? ` · ${formatQuantity(l.quantity, l.item)}` : ''}`
  }
  const parts = [`Shopping · ${formatDay(today, { weekday: true })}`]
  for (const n of nudges) parts.push('', `${n.day} is a non-veg day: fish or meat`)
  for (const s of SECTIONS) {
    const ls = lines.filter((l) => l.section === s)
    if (ls.length) parts.push('', SECTION_TITLES[s], ...ls.map(line))
  }
  return parts.join('\n')
}

/** A WhatsApp link with the text, for phones without the share sheet. */
export const whatsappLink = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`
