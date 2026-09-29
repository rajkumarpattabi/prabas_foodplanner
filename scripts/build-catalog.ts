// npm run catalog: supabase/seed/item_catalog.psv → migration 0005 + docs/ITEM_CATALOG.md
// Runs with Node's built-in TypeScript support.

import { readFileSync, writeFileSync } from 'node:fs'
import { catalogToMarkdown, catalogToSql, parseCatalog } from '../src/stock/catalog.ts'

const root = new URL('../', import.meta.url)
const items = parseCatalog(readFileSync(new URL('supabase/seed/item_catalog.psv', root), 'utf8'))
writeFileSync(new URL('supabase/migrations/0005_item_catalog.sql', root), catalogToSql(items))
writeFileSync(new URL('docs/ITEM_CATALOG.md', root), catalogToMarkdown(items))
console.log(`Catalogue: ${items.length} items → 0005_item_catalog.sql and docs/ITEM_CATALOG.md`)
