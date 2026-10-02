import { createContext, useContext } from 'react'
import type { BillAlias } from './match.ts'
import type { Bill, BillAliasRow } from './types.ts'

export type BillStatus = 'loading' | 'error' | 'ready'

export interface NewBill {
  vendor: string
  bill_date: string
  total: number | null
  lines: number
}

export interface BillState {
  status: BillStatus
  bills: Bill[]
  aliases: BillAliasRow[]
  addBill: (bill: NewBill) => Bill
  /** Undo a bill: the bill record goes (its stock is undone separately). */
  removeBill: (id: string) => void
  /**
   * Remember mappings: new ones are added, ones that point elsewhere now are changed.
   * Returns a function that puts them back as they were (for undo).
   */
  saveAliases: (aliases: readonly BillAlias[]) => () => void
  reload: () => Promise<void>
}

export const BillContext = createContext<BillState | null>(null)

export function useBills(): BillState {
  const ctx = useContext(BillContext)
  if (!ctx) throw new Error('useBills must be used inside BillProvider')
  return ctx
}
