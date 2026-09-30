// npm run catalog:
//   supabase/seed/item_catalog.psv → migration 0005 + docs/ITEM_CATALOG.md
//   supabase/seed/dish_catalog.psv → migration 0007 + docs/DISH_CATALOG.md
// Runs with Node's built-in TypeScript support. Stops without writing anything if the
// dish list names an item or side that doesn't exist.

import { readFileSync, writeFileSync } from 'node:fs'
import { checkDishCatalog, dishCatalogToMarkdown, dishCatalogToSql, parseDishCatalog } from '../src/dishes/catalog.ts'
import { catalogToMarkdown, catalogToSql, parseCatalog } from '../src/stock/catalog.ts'

const root = new URL('../', import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), 'utf8')
const write = (path: string, text: string) => writeFileSync(new URL(path, root), text)

const items = parseCatalog(read('supabase/seed/item_catalog.psv'))
const dishes = parseDishCatalog(read('supabase/seed/dish_catalog.psv'))
const errors = checkDishCatalog(dishes, items)
if (errors.length) {
  console.error(`dish_catalog.psv has ${errors.length} problem(s):\n  ${errors.join('\n  ')}`)
  process.exit(1)
}

write('supabase/migrations/0005_item_catalog.sql', catalogToSql(items))
write('docs/ITEM_CATALOG.md', catalogToMarkdown(items))
write('supabase/migrations/0007_dish_catalog.sql', dishCatalogToSql(dishes))
write('docs/DISH_CATALOG.md', dishCatalogToMarkdown(dishes, items))
console.log(`Catalogue: ${items.length} items → 0005 and docs/ITEM_CATALOG.md`)
console.log(`Catalogue: ${dishes.length} dishes → 0007 and docs/DISH_CATALOG.md`)
