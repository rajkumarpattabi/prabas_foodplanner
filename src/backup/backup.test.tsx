import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { fakeHouseholdApi } from '../test/fakeHousehold.ts'
import { renderApp } from '../test/renderApp.tsx'
import type { Backup } from './format.ts'

// Capture downloads instead of saving files.
let downloads: { name: string; blob: Blob }[] = []
beforeEach(() => {
  downloads = []
  let lastBlob: Blob | null = null
  URL.createObjectURL = vi.fn((blob: Blob) => ((lastBlob = blob), 'blob:test'))
  URL.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push({ name: this.download, blob: lastBlob! })
  })
})
afterEach(() => vi.restoreAllMocks())

async function exportJson(): Promise<Backup> {
  fireEvent.click(await screen.findByRole('button', { name: 'Export backup (JSON)' }))
  await screen.findByText('Backup saved')
  const file = downloads.at(-1)!
  expect(file.name).toMatch(/^prabas-backup-\d{4}-\d{2}-\d{2}\.json$/)
  return JSON.parse(await file.blob.text()) as Backup
}

const OKRA = 'hh-1:okra'
const PONGAL = 'hh-1:dish:ven_pongal'
const SAMBAR = 'hh-1:dish:kathirikkai_sambar'
const CHUTNEY = 'hh-1:dish:thengai_chutney'

function stockEvent(reason: 'bought' | 'used', quantity: number) {
  return {
    id: `ev-${reason}`,
    item_id: OKRA,
    kind: 'delta' as const,
    quantity,
    reason,
    batch_id: null,
    expires_on: null,
    form: 'whole' as const,
    note: null,
    occurred_at: new Date().toISOString(),
  }
}

async function importFile(content: string) {
  const input = screen.getByLabelText('Backup file')
  fireEvent.change(input, { target: { files: [new File([content], 'backup.json', { type: 'application/json' })] } })
}

describe('file backup', () => {
  test('round trip: export, change everything, import, and every table is back', async () => {
    const household = fakeHouseholdApi({ withHousehold: true })
    renderApp({ path: '/settings', household })
    const exported = await exportJson()
    expect(exported).toMatchObject({ app: 'PRABAS', schemaVersion: 1, householdId: 'hh-1' })
    const before = structuredClone(exported.tables)

    // "Wipe": both people's saved details change after the backup.
    await household.execute({
      kind: 'update',
      table: 'profiles',
      match: { user_id: 'user-1' },
      patch: { display_name: 'changed', script_pref: 'en_first', theme_pref: 'dark' },
      id: 'x',
      userId: 'user-1',
      createdAt: '',
      attempts: 0,
    })
    await household.execute({
      kind: 'update',
      table: 'profiles',
      match: { user_id: 'user-2' },
      patch: { display_name: 'changed too' },
      id: 'y',
      userId: 'user-1',
      createdAt: '',
      attempts: 0,
    })

    await importFile(JSON.stringify(exported))
    expect(await screen.findByText('Restore this backup?')).toBeTruthy()
    expect(screen.getByText(/replaces the household's data for everyone/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Replace data' }))
    expect(await screen.findByText('Backup restored')).toBeTruthy()

    const after = await household.backupApi.fetchTables()
    const pick = (rows: Record<string, unknown>[]) =>
      rows.map(({ user_id, display_name, script_pref, theme_pref }) => ({ user_id, display_name, script_pref, theme_pref }))
    expect(pick(after.profiles)).toEqual(pick(before.profiles))
    // The screen shows the restored data too.
    await waitFor(() => expect((screen.getByLabelText('Your name') as HTMLInputElement).value).toBe('raj'))
  })

  test('stock round trip: items and every event come back, on the server and on this phone', async () => {
    const household = fakeHouseholdApi({ withHousehold: true })
    household.server.otherPhoneRecords(stockEvent('bought', 1000))
    const { sync } = renderApp({ path: '/settings', household })
    const exported = await exportJson()
    expect(exported.tables.items).toHaveLength(4)
    expect(exported.tables.stock_events).toHaveLength(1)

    // After the backup: okra is used up and renamed on the other phone.
    household.server.otherPhoneRecords(stockEvent('used', -1000))
    household.server.otherPhoneEditsItem(OKRA, { name_en: 'Okra' })
    await waitFor(async () => expect(await sync.db.stock_events.count()).toBe(2))

    await importFile(JSON.stringify(exported))
    fireEvent.click(await screen.findByRole('button', { name: 'Replace data' }))
    expect(await screen.findByText('Backup restored')).toBeTruthy()

    expect(household.server.events().map((e) => e.id)).toEqual(['ev-bought'])
    expect(household.server.items().find((i) => i.id === OKRA)?.name_en).toBe('Ladies finger')
    // Live updates can't carry a restore's deletions: the phone reads everything again.
    await waitFor(async () => expect((await sync.db.stock_events.toArray()).map((e) => e.id)).toEqual(['ev-bought']))
    expect((await sync.db.items.get(OKRA))?.name_en).toBe('Ladies finger')
  })

  test('a backup from before stock existed leaves stock as it is', async () => {
    const household = fakeHouseholdApi({ withHousehold: true })
    household.server.otherPhoneRecords(stockEvent('bought', 1000))
    renderApp({ path: '/settings', household })
    const exported = await exportJson()
    const { items: _i, stock_events: _e, ...batch1Tables } = exported.tables

    household.server.otherPhoneRecords(stockEvent('used', -250))
    await importFile(JSON.stringify({ ...exported, tables: batch1Tables }))
    fireEvent.click(await screen.findByRole('button', { name: 'Replace data' }))
    expect(await screen.findByText('Backup restored')).toBeTruthy()
    expect(household.server.events()).toHaveLength(2)
  })

  test('dish round trip: every dish comes back as it was, on the server and on this phone', async () => {
    const household = fakeHouseholdApi({ withHousehold: true })
    const { sync } = renderApp({ path: '/settings', household })
    const exported = await exportJson()
    expect(exported.tables.dishes).toHaveLength(4)

    // After the backup: the chutney is deleted and pongal favourited on the other phone.
    household.server.otherPhoneDeletesDish(CHUTNEY)
    household.server.otherPhoneEditsDish(PONGAL, { is_favourite: true })
    await waitFor(async () => expect(await sync.db.dishes.count()).toBe(3))

    await importFile(JSON.stringify(exported))
    fireEvent.click(await screen.findByRole('button', { name: 'Replace data' }))
    expect(await screen.findByText('Backup restored')).toBeTruthy()

    const ids = (rows: { id: unknown }[]) => rows.map((r) => String(r.id)).sort()
    expect(ids(household.server.dishes())).toEqual(ids(exported.tables.dishes as { id: unknown }[]))
    expect(household.server.dishes().find((d) => d.id === PONGAL)).toMatchObject({ is_favourite: false, side_ids: [SAMBAR, CHUTNEY] })
    // Live updates can't carry a restore's deletions or replacements: the phone reads dishes again.
    await waitFor(async () => expect(await sync.db.dishes.count()).toBe(4))
    expect((await sync.db.dishes.get(PONGAL))?.is_favourite).toBe(false)
  })

  test('a backup from before dishes existed leaves dishes as they are', async () => {
    const household = fakeHouseholdApi({ withHousehold: true })
    renderApp({ path: '/settings', household })
    const exported = await exportJson()
    const { dishes: _d, ...batch2Tables } = exported.tables

    household.server.otherPhoneDeletesDish(CHUTNEY)
    await importFile(JSON.stringify({ ...exported, tables: batch2Tables }))
    fireEvent.click(await screen.findByRole('button', { name: 'Replace data' }))
    expect(await screen.findByText('Backup restored')).toBeTruthy()
    expect(household.server.dishes()).toHaveLength(3)
  })

  test('meal round trip: meals and leftovers come back, on the server and on this phone', async () => {
    const household = fakeHouseholdApi({ withHousehold: true })
    const cooked = household.server.otherPhonePutsMeal({
      date: '2026-09-28',
      meal: 'lunch',
      dish_ids: [PONGAL, SAMBAR],
      dish_names: [],
      status: 'cooked',
      cooked_by: 'user-2',
      cooked_at: '2026-09-28T07:00:00.000Z',
    })
    household.server.otherPhoneAddsLeftover({ dish_id: SAMBAR, name_ta: 'சாம்பார்', name_en: 'Sambar', servings: 2, expires_on: '2026-09-29', meal_id: cooked.id })
    const { sync } = renderApp({ path: '/settings', household })
    const exported = await exportJson()
    expect(exported.tables.meals).toHaveLength(1)
    expect(exported.tables.leftovers).toHaveLength(1)

    // After the backup: tomorrow is planned on the other phone.
    household.server.otherPhonePutsMeal({ date: '2026-10-05', meal: 'dinner', dish_ids: [PONGAL] })
    await waitFor(async () => expect(await sync.db.meals.count()).toBe(2))

    await importFile(JSON.stringify(exported))
    fireEvent.click(await screen.findByRole('button', { name: 'Replace data' }))
    expect(await screen.findByText('Backup restored')).toBeTruthy()

    expect(household.server.meals().map((m) => m.id)).toEqual(['hh-1:2026-09-28:lunch'])
    expect(household.server.leftovers()).toMatchObject([{ meal_id: 'hh-1:2026-09-28:lunch', dish_id: SAMBAR, servings: 2 }])
    await waitFor(async () => expect((await sync.db.meals.toArray()).map((m) => m.id)).toEqual(['hh-1:2026-09-28:lunch']))
    expect(await sync.db.leftovers.count()).toBe(1)
  })

  test('a backup from before meals existed leaves meals as they are', async () => {
    const household = fakeHouseholdApi({ withHousehold: true })
    renderApp({ path: '/settings', household })
    const exported = await exportJson()
    const { meals: _m, leftovers: _l, ...batch3Tables } = exported.tables
    household.server.otherPhonePutsMeal({ date: '2026-10-05', meal: 'dinner', dish_ids: [PONGAL] })
    await importFile(JSON.stringify({ ...exported, tables: batch3Tables }))
    fireEvent.click(await screen.findByRole('button', { name: 'Replace data' }))
    expect(await screen.findByText('Backup restored')).toBeTruthy()
    expect(household.server.meals()).toHaveLength(1)
  })

  test('calendar round trip: confirmed and unverified days come back, on the server and on this phone', async () => {
    const household = fakeHouseholdApi({ withHousehold: true })
    household.server.addCalendarDays(
      { date: '2026-11-08', type: 'amavasai', verified: true },
      { date: '2026-11-09', type: 'amavasai', note: 'Sources: goldenchennai.' },
    )
    const { sync } = renderApp({ path: '/settings', household })
    const exported = await exportJson()
    expect(exported.tables.calendar_days).toHaveLength(2)

    // After the backup: the 9 Nov one is confirmed on the other phone.
    household.server.otherPhoneEditsCalendarDay(household.server.calendar()[1].id, { verified: true })
    await waitFor(async () => expect((await sync.db.calendar_days.toArray()).filter((d) => d.verified)).toHaveLength(2))

    await importFile(JSON.stringify(exported))
    fireEvent.click(await screen.findByRole('button', { name: 'Replace data' }))
    expect(await screen.findByText('Backup restored')).toBeTruthy()

    expect(household.server.calendar().find((d) => d.date === '2026-11-09')).toMatchObject({ verified: false, note: 'Sources: goldenchennai.' })
    await waitFor(async () => expect((await sync.db.calendar_days.toArray()).filter((d) => d.verified)).toHaveLength(1))
  })

  test('a backup from before the calendar existed leaves it as it is', async () => {
    const household = fakeHouseholdApi({ withHousehold: true })
    household.server.addCalendarDays({ date: '2026-11-08', type: 'amavasai' })
    renderApp({ path: '/settings', household })
    const exported = await exportJson()
    const { calendar_days: _c, ...batch4Tables } = exported.tables
    household.server.addCalendarDays({ date: '2026-12-02', type: 'family_custom', label: "Thatha's day", verified: true })
    await importFile(JSON.stringify({ ...exported, tables: batch4Tables }))
    fireEvent.click(await screen.findByRole('button', { name: 'Replace data' }))
    expect(await screen.findByText('Backup restored')).toBeTruthy()
    expect(household.server.calendar()).toHaveLength(2)
  })

  test('batches round trip: a batch and its glasses come back, on the server and on this phone', async () => {
    const household = fakeHouseholdApi({ withHousehold: true })
    household.server.addPrepared()
    const ragi = 'hh-1:dish:ragi_koozh'
    household.server.addBatch(
      {
        id: 'b-ragi',
        dish_id: ragi,
        name_ta: 'கேழ்வரகுக் கூழ்',
        name_en: 'Ragi koozh',
        stages: [{ key: 'soak', hours: 9, action: true, takes_ingredients: true }],
        planned_start: '2026-10-05T15:30:00.000Z',
        yield: 10,
        unit: 'glasses',
        keeps_days: 3,
      },
      [{ kind: 'done', stage: 0, occurred_at: '2026-10-05T15:30:00.000Z' }],
    )
    const { sync } = renderApp({ path: '/settings', household })
    const exported = await exportJson()
    expect(exported.tables.batches).toHaveLength(1)
    expect(exported.tables.batch_events).toHaveLength(1)

    // After the backup: two glasses on the other phone.
    household.server.otherPhoneAddsBatchEvent({ batch_id: 'b-ragi', kind: 'used', quantity: 2 })
    await waitFor(async () => expect(await sync.db.batch_events.count()).toBe(2))

    await importFile(JSON.stringify(exported))
    fireEvent.click(await screen.findByRole('button', { name: 'Replace data' }))
    expect(await screen.findByText('Backup restored')).toBeTruthy()

    expect(household.server.batchEvents().map((e) => e.kind)).toEqual(['done'])
    expect(household.server.batches()[0]).toMatchObject({ id: 'b-ragi', dish_id: ragi })
    await waitFor(async () => expect((await sync.db.batch_events.toArray()).map((e) => e.kind)).toEqual(['done']))
  })

  test('a backup from before batches existed leaves them as they are', async () => {
    const household = fakeHouseholdApi({ withHousehold: true })
    household.server.addPrepared()
    renderApp({ path: '/settings', household })
    const exported = await exportJson()
    const { batches: _b, batch_events: _e, ...batch5Tables } = exported.tables
    household.server.addBatch({
      id: 'b-new',
      dish_id: 'hh-1:dish:idli_dosa_batter',
      name_ta: 'இட்லி தோசை மாவு',
      name_en: 'Idli/dosa batter',
      stages: [{ key: 'soak', hours: 5, action: true, takes_ingredients: true }],
      planned_start: '2026-10-05T10:30:00.000Z',
      yield: 4,
      unit: 'meals',
      keeps_days: 3,
    })
    await importFile(JSON.stringify({ ...exported, tables: batch5Tables }))
    fireEvent.click(await screen.findByRole('button', { name: 'Replace data' }))
    expect(await screen.findByText('Backup restored')).toBeTruthy()
    expect(household.server.batches().map((b) => b.id)).toEqual(['b-new'])
  })

  test('shopping list round trip: lines come back, on the server and on this phone', async () => {
    const household = fakeHouseholdApi({ withHousehold: true })
    household.server.otherPhoneShops({ item_id: OKRA, quantity: 500 })
    const { sync } = renderApp({ path: '/settings', household })
    const exported = await exportJson()
    expect(exported.tables.shopping_items).toHaveLength(1)

    // After the backup: bought on the other phone.
    household.server.otherPhoneShops({ id: household.server.shopping()[0].id, item_id: OKRA, done_at: new Date().toISOString(), done_by: 'user-2' })
    await waitFor(async () => expect((await sync.db.shopping_items.toArray())[0]?.done_by).toBe('user-2'))

    await importFile(JSON.stringify(exported))
    fireEvent.click(await screen.findByRole('button', { name: 'Replace data' }))
    expect(await screen.findByText('Backup restored')).toBeTruthy()

    expect(household.server.shopping()).toMatchObject([{ item_id: OKRA, quantity: 500, done_at: null }])
    await waitFor(async () => expect((await sync.db.shopping_items.toArray())[0]?.done_at).toBeNull())
  })

  test('cancel leaves everything as it was', async () => {
    const household = fakeHouseholdApi({ withHousehold: true })
    renderApp({ path: '/settings', household })
    const exported = await exportJson()
    await importFile(JSON.stringify(exported))
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    expect(screen.queryByText('Restore this backup?')).toBeNull()
    expect(household.backupApi.restore).not.toHaveBeenCalled()
  })

  test('a file that is not a PRABAS backup is refused before any confirm', async () => {
    renderApp({ path: '/settings' })
    await screen.findByRole('button', { name: 'Restore from file' })
    await importFile(JSON.stringify({ app: 'MealFast', version: 1 }))
    expect(await screen.findByText('Not a PRABAS backup.')).toBeTruthy()
    expect(screen.queryByText('Restore this backup?')).toBeNull()
  })

  test('a backup from another household says so in the confirm', async () => {
    renderApp({ path: '/settings' })
    const exported = await exportJson()
    await importFile(JSON.stringify({ ...exported, householdId: 'somewhere-else' }))
    expect(await screen.findByText(/from a different household/)).toBeTruthy()
  })

  test('only the backup owner can restore; everyone can export', async () => {
    const household = fakeHouseholdApi({ withHousehold: true })
    household.setBackupOwner('user-2')
    renderApp({ path: '/settings', household })
    expect(await screen.findByText('Only the backup owner (Amma) can restore.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Restore from file' })).toBeNull()
    await exportJson()
  })

  test('CSV export is one file with a section per table', async () => {
    renderApp({ path: '/settings' })
    fireEvent.click(await screen.findByRole('button', { name: 'Export spreadsheet (CSV)' }))
    await screen.findByText('CSV saved')
    const file = downloads.at(-1)!
    expect(file.name).toMatch(/^prabas-\d{4}-\d{2}-\d{2}\.csv$/)
    const text = await file.blob.text()
    expect(text).toContain('People\nname,dish_names,joined\n')
    expect(text).toContain('raj,ta_first,')
    expect(text).toContain('\n\nStock\ndate,item_ta,item_en,what,change,set_to,unit,reason,by\n')
    expect(text).toContain('\n\nMeals\ndate,meal,dishes_ta,dishes_en,status,planned_by,cooked_by\n')
  })

  test('offline export explains itself', async () => {
    const household = fakeHouseholdApi({ withHousehold: true })
    renderApp({ path: '/settings', household })
    await screen.findByRole('button', { name: 'Export backup (JSON)' })
    household.setOffline(true)
    fireEvent.click(screen.getByRole('button', { name: 'Export backup (JSON)' }))
    expect(await screen.findByText("You're offline. Try again when you're connected.")).toBeTruthy()
  })
})
