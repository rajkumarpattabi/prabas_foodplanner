import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react'
import type { NewOp } from '../offline/outbox.ts'
import { useSync } from '../offline/syncContext.ts'
import { useTableSync, type TableChange } from '../offline/useTableSync.ts'
import type { BillApi } from './api.ts'
import { BillContext, type BillState, type BillStatus, type NewBill } from './billContext.ts'
import type { Bill, BillAliasRow } from './types.ts'

interface Props {
  api: BillApi
  householdId: string
  userId: string
  children: ReactNode
}

/** Offline-first bills and the names they've taught (see useTableSync). */
export function BillProvider({ api, householdId, userId, children }: Props) {
  const { db } = useSync()
  const tables = useMemo(() => ({ bills: db.bills, bill_aliases: db.bill_aliases }), [db])
  const load = useCallback(() => api.load(householdId), [api, householdId])
  const subscribe = useCallback((onChange: (c: TableChange) => void) => api.subscribe(householdId, onChange), [api, householdId])
  const { loaded, error, reload, save, remove } = useTableSync({ householdId, userId, cacheKey: `bills:${householdId}`, tables, load, subscribe })

  const bills = useLiveQuery(() => db.bills.where('household_id').equals(householdId).toArray(), [db, householdId])
  const aliases = useLiveQuery(() => db.bill_aliases.where('household_id').equals(householdId).toArray(), [db, householdId])
  // The latest names, for an undo called later.
  const latest = useRef(aliases)
  useEffect(() => {
    latest.current = aliases
  }, [aliases])

  const addBill = useCallback(
    (input: NewBill): Bill => {
      const bill: Bill = { id: crypto.randomUUID(), household_id: householdId, ...input, created_by: userId, created_at: new Date().toISOString() }
      const { created_at: _c, ...row } = bill
      void save('bills', [bill], [{ kind: 'insert', table: 'bills', row, userId }])
      return bill
    },
    [householdId, userId, save],
  )

  const removeBill = useCallback((id: string) => void remove('bills', id), [remove])

  const saveAliases = useCallback<BillState['saveAliases']>(
    (wanted) => {
      const now = new Date().toISOString()
      const current = latest.current ?? []
      const added: string[] = []
      const changed: { id: string; was: string }[] = []
      const rows: BillAliasRow[] = []
      const ops: NewOp[] = []
      for (const a of wanted) {
        const existing = current.find((r) => r.vendor === a.vendor && r.raw === a.raw)
        if (existing) {
          if (existing.item_id === a.item_id) continue
          changed.push({ id: existing.id, was: existing.item_id })
          rows.push({ ...existing, item_id: a.item_id, updated_by: userId, updated_at: now })
          ops.push({ kind: 'update', table: 'bill_aliases', match: { id: existing.id }, patch: { item_id: a.item_id }, userId })
        } else {
          const row: BillAliasRow = { id: crypto.randomUUID(), household_id: householdId, ...a, created_by: userId, created_at: now, updated_by: userId, updated_at: now }
          added.push(row.id)
          rows.push(row)
          const { created_at: _c, updated_at: _u, ...insert } = row
          ops.push({ kind: 'insert', table: 'bill_aliases', row: insert, userId })
        }
      }
      if (rows.length) void save('bill_aliases', rows, ops)
      return () => {
        for (const id of added) void remove('bill_aliases', id)
        const rows: BillAliasRow[] = []
        const ops: NewOp[] = []
        for (const c of changed) {
          const row = (latest.current ?? []).find((r) => r.id === c.id)
          if (!row) continue
          rows.push({ ...row, item_id: c.was, updated_by: userId, updated_at: new Date().toISOString() })
          ops.push({ kind: 'update', table: 'bill_aliases', match: { id: c.id }, patch: { item_id: c.was }, userId })
        }
        if (rows.length) void save('bill_aliases', rows, ops)
      }
    },
    [householdId, userId, save, remove],
  )

  const ready = loaded === true && bills !== undefined && aliases !== undefined
  const status: BillStatus = ready ? 'ready' : loaded === false && error ? 'error' : 'loading'
  const value = useMemo<BillState>(
    () => ({ status, bills: bills ?? [], aliases: aliases ?? [], addBill, removeBill, saveAliases, reload }),
    [status, bills, aliases, addBill, removeBill, saveAliases, reload],
  )
  return <BillContext.Provider value={value}>{children}</BillContext.Provider>
}
