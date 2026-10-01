import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useMemo, type ReactNode } from 'react'
import { useClock } from '../lib/clock.ts'
import { useSync } from '../offline/syncContext.ts'
import { useTableSync, type TableChange } from '../offline/useTableSync.ts'
import type { BatchApi } from './api.ts'
import { BatchContext, type BatchesState, type BatchStatus, type NewBatch, type NewBatchEvent } from './batchContext.ts'
import type { Batch, BatchEvent } from './types.ts'

interface Props {
  api: BatchApi
  householdId: string
  userId: string
  children: ReactNode
}

/** Offline-first batches and their events (see useTableSync), and the ways to add to them. */
export function BatchProvider({ api, householdId, userId, children }: Props) {
  const { db } = useSync()
  // Stage times are the app's time (fixed in tests), not the system clock.
  const clock = useClock()
  const tables = useMemo(() => ({ batches: db.batches, batch_events: db.batch_events }), [db])
  const load = useCallback(() => api.load(householdId), [api, householdId])
  const subscribe = useCallback((onChange: (c: TableChange) => void) => api.subscribe(householdId, onChange), [api, householdId])
  const { loaded, error, reload, save, remove } = useTableSync({
    householdId,
    userId,
    cacheKey: `batches:${householdId}`,
    tables,
    load,
    subscribe,
  })

  const batches = useLiveQuery(() => db.batches.where('household_id').equals(householdId).toArray(), [db, householdId])
  const events = useLiveQuery(() => db.batch_events.where('household_id').equals(householdId).toArray(), [db, householdId])

  const startBatch = useCallback(
    (input: NewBatch): Batch => {
      const batch: Batch = {
        id: crypto.randomUUID(),
        household_id: householdId,
        dish_id: input.dish_id,
        name_ta: input.name_ta,
        name_en: input.name_en,
        stages: input.stages,
        planned_start: input.planned_start.toISOString(),
        ready_by: input.ready_by ? input.ready_by.toISOString() : null,
        yield: input.yield,
        unit: input.unit,
        keeps_days: input.keeps_days,
        created_by: userId,
        created_at: clock().toISOString(),
      }
      // Supabase stamps the time.
      const { created_at: _c, ...row } = batch
      void save('batches', [batch], [{ kind: 'insert', table: 'batches', row, userId }])
      return batch
    },
    [householdId, userId, save, clock],
  )

  const addEvent = useCallback(
    (batchId: string, input: NewBatchEvent): BatchEvent => {
      const now = clock().toISOString()
      const event: BatchEvent = {
        id: crypto.randomUUID(),
        household_id: householdId,
        batch_id: batchId,
        kind: input.kind,
        stage: input.stage ?? null,
        quantity: input.quantity ?? null,
        undoes: input.undoes ?? null,
        occurred_at: input.at ? input.at.toISOString() : now,
        created_by: userId,
        created_at: now,
      }
      const { created_at: _c, ...row } = event
      void save('batch_events', [event], [{ kind: 'insert', table: 'batch_events', row, userId }])
      return event
    },
    [householdId, userId, save, clock],
  )

  const removeBatch = useCallback(
    (id: string) => {
      void (async () => {
        // Its events go with it, here as on the server.
        await db.batch_events.where('batch_id').equals(id).delete()
        await remove('batches', id)
      })()
    },
    [db, remove],
  )

  const ready = loaded === true && batches !== undefined && events !== undefined
  const status: BatchStatus = ready ? 'ready' : loaded === false && error ? 'error' : 'loading'
  const value = useMemo<BatchesState>(
    () => ({ status, error, batches: batches ?? [], events: events ?? [], startBatch, addEvent, removeBatch, reload }),
    [status, error, batches, events, startBatch, addEvent, removeBatch, reload],
  )
  return <BatchContext.Provider value={value}>{children}</BatchContext.Provider>
}
