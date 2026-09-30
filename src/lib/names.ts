import type { ScriptPref } from './database.types.ts'

/** Bilingual names in the order this person chose: [shown first, shown smaller]. */
export function namePair(x: { name_ta: string; name_en: string }, pref: ScriptPref): [string, string] {
  return pref === 'en_first' ? [x.name_en, x.name_ta] : [x.name_ta, x.name_en]
}
