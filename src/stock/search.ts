// Item search across Tamil script, English, Tanglish spellings, and aliases.
// No dependency: Latin text is folded so the many ways of spelling a Tamil word in
// English land on the same key, then matched by prefix, substring, or a small typo allowance.

import type { Item } from './types.ts'

type SearchItem = Pick<Item, 'id' | 'name_ta' | 'name_en' | 'aliases'>

/**
 * Folds Latin text so Tanglish variants compare equal:
 * vendakkai / vendakai / vendaikkai → "ventakai", keerai / kirai → "kirai".
 * Tamil script is left as is (only Unicode-normalised).
 */
export function fold(text: string): string {
  let s = text.normalize('NFC').toLowerCase()
  if (/[஀-௿]/.test(s)) return s.replace(/\s+/g, ' ').trim()
  s = s
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/zh/g, 'l')
    .replace(/(t|d)h/g, 't')
    .replace(/sh|ch/g, 's')
    .replace(/ph/g, 'p')
    .replace(/w/g, 'v')
    .replace(/[bg]/g, (c) => (c === 'b' ? 'p' : 'k'))
    .replace(/d/g, 't')
    .replace(/j/g, 's')
    .replace(/ee|ii|ie/g, 'i')
    .replace(/oo|uu/g, 'u')
    .replace(/aa/g, 'a')
    .replace(/ay\b/g, 'ai')
    .replace(/y/g, 'i')
    .replace(/([a-z])\1+/g, '$1')
    .replace(/ai(?=k)/g, 'a') // vendaikkai → vendakai
  return s.replace(/\s+/g, ' ').trim()
}

/** Edit distance between two strings, or Infinity once it's more than `max` (stops early). */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return Infinity
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let rowMin = i
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      rowMin = Math.min(rowMin, cur[j])
    }
    if (rowMin > max) return Infinity
    prev = cur
  }
  return prev[b.length] <= max ? prev[b.length] : Infinity
}

const withinEdits = (a: string, b: string, max: number) => editDistance(a, b, max) <= max

/** How well one name matches the folded query: higher is better, 0 is no match. */
function score(name: string, q: string): number {
  const n = fold(name)
  if (!n || !q) return 0
  if (n === q) return 100
  if (n.startsWith(q)) return 80
  const words = n.split(' ')
  if (words.some((w) => w.startsWith(q))) return 70
  if (n.includes(q)) return 50
  // Typos in longer words: one edit for 5–7 letters, two from 8.
  if (q.length >= 5) {
    const max = q.length >= 8 ? 2 : 1
    const target = [n, ...words]
    if (target.some((t) => withinEdits(q, t, max) || (t.length > q.length && withinEdits(q, t.slice(0, q.length), max)))) {
      return 30
    }
  }
  return 0
}

/** Items matching the query, best first. An empty query matches nothing. */
export function searchItems<T extends SearchItem>(items: readonly T[], query: string): T[] {
  const q = fold(query)
  if (!q) return []
  return items
    .map((item) => ({
      item,
      s: Math.max(score(item.name_en, q), score(item.name_ta, q), ...item.aliases.map((a) => score(a, q))),
    }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.item.name_en.localeCompare(b.item.name_en))
    .map((x) => x.item)
}
