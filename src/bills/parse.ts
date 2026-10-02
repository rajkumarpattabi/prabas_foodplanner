// Reading a bill's text (from OCR, or pasted from Google Lens or Live Text) into lines:
// a name, a quantity and unit if there is one, and a price. Lines that aren't groceries
// (totals, bags, tax, dates) are set aside. English, Tamil and mixed bills.

import type { EntryUnit } from '../stock/types.ts'

export interface BillLine {
  /** The line as read, for the review screen. */
  raw: string
  /** What's left once the quantity and price are taken out: "Tomato", "தக்காளி". */
  name: string
  quantity: number | null
  unit: EntryUnit | null
  /** Rupees for the line. */
  price: number | null
  /** Not groceries: totals, carry bag, tax, dates, phone numbers. */
  other: boolean
}

export interface ParsedBill {
  /** The shop's name, guessed from the top of the bill ('' if none). */
  vendor: string
  lines: BillLine[]
}

/** Unit words as they appear on bills, longest first so "kgs" wins over "g". */
const UNITS: [RegExp, EntryUnit][] = [
  // OCR often reads கி as தி, and "kg" as "kq".
  [/^(kgs?|kq|kilos?|kilograms?|கிலோ|திலோ|கி\.?)$/, 'kg'],
  [/^(gms?|grams?|grm?s?|g|கிராம்|கி\.?ரா)$/, 'g'],
  [/^(ltrs?|litres?|liters?|lit|l|லி\.?|லிட்டர்)$/, 'l'],
  [/^(ml|மி\.?லி)$/, 'ml'],
  [/^(pcs?|pes|pc5|pieces?|nos?|no|numbers?|எண்|எண்ணம்)$/, 'piece'],
  [/^(bunch(es)?|kattu|கட்டு|கட்)$/, 'bunch'],
  [/^(pkts?|packets?|pack|பாக்கெட்)$/, 'packet'],
]

const unitOf = (word: string): EntryUnit | null => {
  const w = word.toLowerCase().replace(/\.$/, '')
  for (const [re, unit] of UNITS) if (re.test(w)) return unit
  return null
}

/** Words that mark a line as not a grocery item. (\b only works for Latin letters, so Tamil words use spaces.) */
const OTHER =
  /\b(sub\s*total|total|net\s*amount|amount|grand|discount|disc|savings?|carry\s*bags?|bags?|cover|gst|cgst|sgst|igst|tax|round(ed)?\s*off|cash|change|paid|balance|bill\s*no|invoice|receipt|date|time|phone|ph|mob(ile)?|cell|gstin|thank|visit|again|qty|rate|mrp|items?|upi|gpay|card)\b|மொத்தம்|தள்ளுபடி|நன்றி|தேதி|(?:^|\s)பை(?:\s|$)/i

/** Numbers as bills write them: "40", "40.00", "1,250", "½", "1/2". */
const NUMBER = /(\d+\s*\/\s*\d+|\d+(?:[.,]\d+)*|½|¼|¾)/
const toNumber = (s: string): number => {
  if (s === '½') return 0.5
  if (s === '¼') return 0.25
  if (s === '¾') return 0.75
  if (s.includes('/')) {
    const [a, b] = s.split('/').map((x) => Number(x.trim()))
    return b ? a / b : NaN
  }
  // "1,250" is a thousands separator; "2,5" a decimal comma.
  const t = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.')
  return Number(t)
}

const hasLetters = (s: string) => /[a-zA-Z஀-௿]/.test(s)

/**
 * One line of a bill, or null for a blank one. `asItem` reads it as groceries even if it
 * looks like a total or a bag (set aside by mistake, and put back on the review screen).
 */
export function parseLine(input: string, { asItem = false } = {}): BillLine | null {
  // Zero-width joiners (OCR leaves them after Tamil words) would break matching, and a
  // lone Tamil numeral is OCR reading a speck: bills use the digits 0 to 9.
  const raw = input
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .replace(/(^|\s)[\u0be6-\u0bef](?=\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!raw) return null
  // Rupee signs and "Rs" go; "/-" after prices too.
  let s = raw.replace(/₹|\brs\.?|\binr\b|\/-/gi, ' ')
  // A leading serial number: "1.", "2)", "3 -".
  s = s.replace(/^\s*\d{1,2}\s*[.)\-:]\s+/, '')

  if (!hasLetters(s) || (!asItem && OTHER.test(s)) || /\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/.test(s) || /\d{10}/.test(s)) {
    return { raw, name: s.trim(), quantity: null, unit: null, price: null, other: true }
  }

  let quantity: number | null = null
  let unit: EntryUnit | null = null
  // A number with a unit, joined or not: "1kg", "500 g", "2 கட்டு", "1/2 kg".
  const withUnit = new RegExp(`${NUMBER.source}\\s*([a-zA-Z஀-௿.]+)`, 'g')
  for (const m of s.matchAll(withUnit)) {
    const u = unitOf(m[2])
    if (u) {
      quantity = toNumber(m[1])
      unit = u
      s = s.replace(m[0], ' ')
      break
    }
  }
  // "x2", "2x", "* 2": a count.
  const times = /(?:^|\s)(?:x|\*)\s*(\d+)\b|\b(\d+)\s*x(?=\s|$)/i.exec(s)
  if (quantity === null && times) {
    quantity = Number(times[1] ?? times[2])
    s = s.replace(times[0], ' ')
  }
  // What numbers are left: the last is the price; one before it with no unit is a count.
  const numbers = [...s.matchAll(new RegExp(NUMBER.source, 'g'))].map((m) => ({ text: m[0], value: toNumber(m[1]) }))
  let price: number | null = null
  if (numbers.length) {
    const last = numbers.at(-1)!
    price = last.value > 0 ? last.value : null
    s = s.replace(new RegExp(`${last.text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}(?!.*\\d)`), ' ')
    if (quantity === null && numbers.length >= 2) {
      const before = numbers.at(-2)!
      if (Number.isInteger(before.value) && before.value > 0 && before.value <= 50) {
        quantity = before.value
        s = s.replace(before.text, ' ')
      }
    }
  }
  const name = s
    .replace(/\d+/g, ' ')
    .replace(/[@:|=*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[-.,\s]+|[-.,\s]+$/g, '')
  if (!hasLetters(name)) return { raw, name, quantity, unit, price, other: true }
  return { raw, name, quantity, unit, price, other: false }
}

/**
 * The whole bill. The shop's name is the first line near the top with letters and no
 * price; the rest are read line by line.
 */
export function parseBill(text: string): ParsedBill {
  const rows = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  let vendor = ''
  let start = 0
  for (let i = 0; i < Math.min(3, rows.length); i++) {
    const r = rows[i]
    if (hasLetters(r) && !/\d/.test(r) && !OTHER.test(r)) {
      vendor = r.replace(/\s+/g, ' ')
      start = i + 1
      break
    }
  }
  const lines = rows
    .slice(start)
    .map((r) => parseLine(r))
    .filter((l): l is BillLine => l !== null)
  // Before the first line with a price: the shop's address and the like, not items.
  const firstPriced = lines.findIndex((l) => !l.other && l.price !== null)
  return { vendor, lines: lines.map((l, i) => (i < firstPriced && !l.other && l.price === null && l.quantity === null ? { ...l, other: true } : l)) }
}
