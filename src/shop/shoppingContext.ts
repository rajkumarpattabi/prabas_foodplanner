import { createContext, useContext } from 'react'
import type { SectionKey, ShoppingItem } from './types.ts'

export type ShoppingStatus = 'loading' | 'error' | 'ready'

export interface ShoppingState {
  status: ShoppingStatus
  error: string | null
  rows: ShoppingItem[]
  /** Add an item by hand (or change how much, if it's on the list already). */
  addWant: (itemId: string, quantity?: number | null) => ShoppingItem
  /** Bought (true), or back on the list (false, for undo). */
  setBought: (id: string, bought: boolean) => void
  /** Hide a worked-out line for a few days. */
  skip: (itemId: string, section: SectionKey) => ShoppingItem
  /** Take a line off: undo a skip, or remove something added by hand. */
  removeRow: (id: string) => void
  reload: () => Promise<void>
}

export const ShoppingContext = createContext<ShoppingState | null>(null)

export function useShopping(): ShoppingState {
  const ctx = useContext(ShoppingContext)
  if (!ctx) throw new Error('useShopping must be used inside ShoppingProvider')
  return ctx
}
