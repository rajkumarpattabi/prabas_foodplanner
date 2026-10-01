// npm run catalog:
//   supabase/seed/item_catalog.psv → migration 0005 + docs/ITEM_CATALOG.md
//   supabase/seed/dish_catalog.psv → migration 0007 + docs/DISH_CATALOG.md
//   supabase/seed/calendar.psv     → migration 0010 + docs/CALENDAR.md
//   supabase/seed/prepared.psv     → migration 0012 + docs/PREPARED.md
// Runs with Node's built-in TypeScript support. Stops without writing anything if the
// dish list names an item or side that doesn't exist.

import { readFileSync, writeFileSync } from 'node:fs'
import { calendarToMarkdown, calendarToSql, parseCalendarCatalog } from '../src/calendar/catalog.ts'
import { checkPreparedCatalog, parsePreparedCatalog, preparedCatalogToMarkdown, preparedCatalogToSql } from '../src/prepared/catalog.ts'
import { checkDishCatalog, dishCatalogToMarkdown, dishCatalogToSql, parseDishCatalog } from '../src/dishes/catalog.ts'
import { catalogToMarkdown, catalogToSql, parseCatalog } from '../src/stock/catalog.ts'

const root = new URL('../', import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), 'utf8')
const write = (path: string, text: string) => writeFileSync(new URL(path, root), text)

const items = parseCatalog(read('supabase/seed/item_catalog.psv'))
const dishes = parseDishCatalog(read('supabase/seed/dish_catalog.psv'))
const calendar = parseCalendarCatalog(read('supabase/seed/calendar.psv'))
const errors = checkDishCatalog(dishes, items)
if (errors.length) {
  console.error(`dish_catalog.psv has ${errors.length} problem(s):\n  ${errors.join('\n  ')}`)
  process.exit(1)
}
const prepared = parsePreparedCatalog(read('supabase/seed/prepared.psv'))
const preparedErrors = checkPreparedCatalog(prepared, dishes, items)
if (preparedErrors.length) {
  console.error(`prepared.psv has ${preparedErrors.length} problem(s):\n  ${preparedErrors.join('\n  ')}`)
  process.exit(1)
}

write('supabase/migrations/0005_item_catalog.sql', catalogToSql(items))
write('docs/ITEM_CATALOG.md', catalogToMarkdown(items))
write('supabase/migrations/0007_dish_catalog.sql', dishCatalogToSql(dishes))
write('docs/DISH_CATALOG.md', dishCatalogToMarkdown(dishes, items))
write('supabase/migrations/0010_calendar_dates.sql', calendarToSql(calendar))
write('docs/CALENDAR.md', calendarToMarkdown(calendar))
write('supabase/migrations/0012_prepared_catalog.sql', preparedCatalogToSql(prepared, dishes))
write('docs/PREPARED.md', preparedCatalogToMarkdown(prepared, dishes, items))
console.log(`Catalogue: ${items.length} items → 0005 and docs/ITEM_CATALOG.md`)
console.log(`Catalogue: ${dishes.length} dishes → 0007 and docs/DISH_CATALOG.md`)
console.log(`Calendar: ${calendar.length} entries → 0010 and docs/CALENDAR.md`)
console.log(`Prepared: ${prepared.prepared.length} items, ${prepared.changes.length} dishes using them → 0012 and docs/PREPARED.md`)
