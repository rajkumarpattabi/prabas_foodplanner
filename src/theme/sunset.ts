// Sunrise and sunset from the standard sunrise equation (accurate to a minute or two,
// which is plenty for switching the theme). Pure: no clock, no location lookup.

export interface GeoPoint {
  lat: number
  lng: number // east positive
}

// The household cooks in Chennai. Used for "dark after sunset".
export const HOME: GeoPoint = { lat: 13.0827, lng: 80.2707 }

const J2000 = 2451545.0
const DAY_MS = 86_400_000
const UNIX_EPOCH_JD = 2440587.5
const rad = Math.PI / 180

const toJulian = (ms: number) => ms / DAY_MS + UNIX_EPOCH_JD
const fromJulian = (jd: number) => new Date((jd - UNIX_EPOCH_JD) * DAY_MS)

export interface SunTimes {
  sunrise: Date
  sunset: Date
}

/**
 * Sunrise and sunset for the calendar day that `date` falls on (device local date).
 * Returns null when the sun never rises or never sets that day (polar regions).
 */
export function sunTimes(date: Date, at: GeoPoint = HOME): SunTimes | null {
  const noonUtc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12)
  const n = Math.round(toJulian(noonUtc) - J2000)
  const meanSolarNoon = n - at.lng / 360

  const M = (357.5291 + 0.98560028 * meanSolarNoon) % 360
  const C = 1.9148 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 0.0003 * Math.sin(3 * M * rad)
  const lambda = (M + C + 180 + 102.9372) % 360
  const transit = J2000 + meanSolarNoon + 0.0053 * Math.sin(M * rad) - 0.0069 * Math.sin(2 * lambda * rad)

  const sinDec = Math.sin(lambda * rad) * Math.sin(23.4397 * rad)
  const cosDec = Math.cos(Math.asin(sinDec))
  const cosHourAngle =
    (Math.sin(-0.833 * rad) - Math.sin(at.lat * rad) * sinDec) / (Math.cos(at.lat * rad) * cosDec)
  if (cosHourAngle < -1 || cosHourAngle > 1) return null

  const halfDay = Math.acos(cosHourAngle) / rad / 360
  return { sunrise: fromJulian(transit - halfDay), sunset: fromJulian(transit + halfDay) }
}

/** True between today's sunset and tomorrow's sunrise, as seen on `now`'s calendar day. */
export function isAfterDark(now: Date, at: GeoPoint = HOME): boolean {
  const t = sunTimes(now, at)
  if (!t) return false
  return now < t.sunrise || now >= t.sunset
}

/** The next sunrise or sunset after `now`: when the automatic theme should next change. */
export function nextSunChange(now: Date, at: GeoPoint = HOME): Date {
  const today = sunTimes(now, at)
  if (today && now < today.sunrise) return today.sunrise
  if (today && now < today.sunset) return today.sunset
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12)
  return sunTimes(tomorrow, at)?.sunrise ?? new Date(now.getTime() + DAY_MS)
}
