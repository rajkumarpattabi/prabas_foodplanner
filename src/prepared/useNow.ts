import { useEffect, useState } from 'react'
import { useClock } from '../lib/clock.ts'

/** How often "now" moves on while a screen is open. */
const TICK_MS = 60_000

/**
 * The time, kept current: every minute, and on coming back to the app (a batch's
 * "soak now" shouldn't wait for a reload). Tests move it with the clock and a focus event.
 */
export function useNow(): Date {
  const clock = useClock()
  const [now, setNow] = useState(() => clock())
  useEffect(() => {
    const tick = () => setNow(clock())
    const timer = window.setInterval(tick, TICK_MS)
    const onVisible = () => document.visibilityState === 'visible' && tick()
    window.addEventListener('focus', tick)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', tick)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [clock])
  return now
}
