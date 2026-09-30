import { useCallback } from 'react'
import { useToast } from '../components/toastContext.ts'
import { undoEvents } from './actions.ts'
import { computeStock } from './computeStock.ts'
import { useStock, type NewStockEvent } from './stockContext.ts'
import type { Item } from './types.ts'
import { formatQuantity } from './units.ts'

/**
 * Applies stock changes at once and shows a toast with an exact undo.
 * `message` gets the new total, formatted ("750 g").
 */
export function useStockAction() {
  const { eventsByItem, record } = useStock()
  const toast = useToast()
  return useCallback(
    (item: Item, events: NewStockEvent[], message: (total: string) => string) => {
      if (!events.length) return
      const before = eventsByItem.get(item.id) ?? []
      const added = record(events)
      const undo = undoEvents(item, before, added)
      const after = computeStock(item, [...before, ...added]).total
      toast(message(formatQuantity(after, item)), { undo: () => void record(undo) })
    },
    [eventsByItem, record, toast],
  )
}
