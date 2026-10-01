import { useMemo, useState } from 'react'
import { Sheet } from '../components/Sheet.tsx'
import { useToast } from '../components/toastContext.ts'
import { useDishes } from '../dishes/dishContext.ts'
import { useReadyHousehold } from '../household/householdContext.ts'
import { localDate } from '../lib/dates.ts'
import { namePair } from '../lib/names.ts'
import { cookEvents, type CookLine } from '../plan/cook.ts'
import { StockLines } from '../plan/StockLines.tsx'
import { usePlanContext } from '../plan/usePlanContext.ts'
import { undoAll } from '../stock/actions.ts'
import { primaryClass } from '../stock/labels.ts'
import { useStock } from '../stock/stockContext.ts'
import { useBatches } from './batchContext.ts'
import { prepPlan, STAGE_LABELS } from './plan.ts'
import type { Batch } from './types.ts'

interface Props {
  batch: Batch
  stage: number
  now: Date
  onClose: () => void
}

/** Doing the stage that takes the ingredients (soaking, kneading): the stock for one batch, each line editable. */
export function StageSheet({ batch, stage, now, onClose }: Props) {
  const { items, eventsByItem, record } = useStock()
  const { dishesById } = useDishes()
  const { addEvent } = useBatches()
  const pref = useReadyHousehold().me.script_pref
  const toast = useToast()
  const ctx = usePlanContext(localDate(now))
  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])
  const plan = batch.dish_id ? prepPlan(dishesById.get(batch.dish_id) ?? { prep_plan: null }) : null
  const [lines, setLines] = useState<CookLine[]>(() =>
    (plan?.ingredients ?? []).map((i) => ({ item_id: i.item_id, quantity: i.quantity, optional: !!i.optional, include: !i.optional })),
  )
  const [first] = namePair(batch, pref)
  const label = STAGE_LABELS[batch.stages[stage].key]

  const confirm = () => {
    const added = record(cookEvents(lines, ctx.stockTotals))
    const undoStock = undoAll(itemsById, eventsByItem, added)
    const done = addEvent(batch.id, { kind: 'done', stage })
    toast(`${first} ${label.done.toLowerCase()}${added.length ? ' · stock updated' : ''}`, {
      undo: () => {
        record(undoStock)
        addEvent(batch.id, { kind: 'undo', undoes: done.id })
      },
    })
    onClose()
  }

  return (
    <Sheet title={`${label.verb} ${first}`} onClose={onClose}>
      <h3 className="mt-4 text-sm font-semibold text-ink-muted">Take from stock, for one batch</h3>
      <StockLines lines={lines} onChange={setLines} itemsById={itemsById} stockTotals={ctx.stockTotals} pref={pref} label="Take from stock" />
      <p className="mt-3 text-sm text-ink-muted">Taken once, now. Cooking with it later takes nothing more for these.</p>
      <button type="button" onClick={confirm} className={`mt-5 ${primaryClass}`}>
        {label.done} · take from stock
      </button>
    </Sheet>
  )
}
