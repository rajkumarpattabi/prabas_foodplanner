import { createContext, useContext } from 'react'
import type { Batch, BatchEvent, BatchEventKind, PrepStage } from './types.ts'

export type BatchStatus = 'loading' | 'error' | 'ready'

export interface NewBatch {
  dish_id: string
  name_ta: string
  name_en: string
  stages: PrepStage[]
  planned_start: Date
  ready_by?: Date | null
  yield: number
  unit: Batch['unit']
  keeps_days: number
}

export interface NewBatchEvent {
  kind: BatchEventKind
  stage?: number | null
  quantity?: number | null
  undoes?: string | null
  /** Now, unless said otherwise. */
  at?: Date
}

export interface BatchesState {
  status: BatchStatus
  error: string | null
  batches: Batch[]
  events: BatchEvent[]
  startBatch: (batch: NewBatch) => Batch
  /** Something happened to a batch: a stage done, a glass had, thrown away. */
  addEvent: (batchId: string, event: NewBatchEvent) => BatchEvent
  /** Undo a start: the batch and its events go. */
  removeBatch: (id: string) => void
  reload: () => Promise<void>
}

export const BatchContext = createContext<BatchesState | null>(null)

export function useBatches(): BatchesState {
  const ctx = useContext(BatchContext)
  if (!ctx) throw new Error('useBatches must be used inside BatchProvider')
  return ctx
}
