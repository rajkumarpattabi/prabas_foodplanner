import { PrabasDb } from './db.ts'
import { createOutbox, type Executor, type Outbox } from './outbox.ts'

export interface Sync {
  db: PrabasDb
  outbox: Outbox
  /** Whose queued changes may be sent. Set on login, cleared on log out. */
  setUser: (userId: string | null) => void
}

export function createSync(execute: Executor, dbName?: string): Sync {
  const user = { id: null as string | null }
  const db = new PrabasDb(dbName)
  const outbox = createOutbox({ db, execute, currentUser: () => user.id })
  return {
    db,
    outbox,
    setUser: (id) => {
      user.id = id
    },
  }
}
