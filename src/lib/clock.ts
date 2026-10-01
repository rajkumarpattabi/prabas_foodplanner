import { createContext, useContext } from 'react'

/**
 * What time it is, for screens that work from "today" (the next meal, Saturday rules).
 * The real clock in the app; tests set a fixed one, so a Saturday doesn't change them.
 */
export const ClockContext = createContext<() => Date>(() => new Date())

export const useClock = () => useContext(ClockContext)
