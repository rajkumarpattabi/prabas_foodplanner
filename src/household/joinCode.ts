// Join codes are stored as 6 characters ("K7M4QP") and shown split ("K7M-4QP").
// Mirrors private.normalise_join_code in the 0001 migration.

export const JOIN_CODE_LENGTH = 6

/** Upper case, letters and digits only, so "k7m 4qp" and "K7M-4QP" both work. */
export function normaliseJoinCode(raw: string): string {
  return raw.replace(/[^a-z0-9]/gi, '').toUpperCase()
}

export function formatJoinCode(code: string): string {
  const c = normaliseJoinCode(code)
  return c.length > 3 ? `${c.slice(0, 3)}-${c.slice(3)}` : c
}
