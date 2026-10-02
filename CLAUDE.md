# PRABAS Food Planner

A shared household meal planner PWA for a Tamil family of five. Its main job is to answer
"what do I cook next?" in under a minute, usually the night before. Inventory, calendar rules,
and nutrition tracking exist to make that answer smart.

Users: two adults (Raj on iPhone, his wife on Android) sharing one household's data.

Full requirements, grouped into batches: `docs/REQUIREMENTS.md`
Google Drive backup spec (ported from the MealFast app): `docs/DRIVE_BACKUP.md`
Reference app with the working Drive backup code: `C:\Users\rajkumar_p\dev\mealfast` (see `app.js`, "Google Drive backup" section)

## How we work

- Build **one batch at a time**, in the order in `docs/REQUIREMENTS.md`. Do not start work from a later batch unless asked.
- Start each batch in plan mode: read the batch, propose the plan (files, schema changes, screens), and wait for approval.
- Work in small steps. After each step, run the type check, lint, and tests, then commit with a clear message.
- Ask before adding any dependency not listed in the stack below.
- Never commit secrets. Keys live in `.env.local` (git-ignored) and Supabase secrets. Keep `.env.example` up to date.
- At the end of each batch, update the "Batch status" section at the bottom of this file.

## Stack

- React + TypeScript + Vite
- `vite-plugin-pwa` for the manifest, service worker, and offline caching
- Tailwind CSS for styling
- React Router for navigation
- Supabase: Postgres database, auth, real-time sync, Edge Functions, scheduled jobs
- Dexie (IndexedDB) for the offline cache
- Vitest for unit tests (required for scoring, calendar rules, unit conversion, and bill matching)
- Hosting: GitHub Pages, deployed by a GitHub Actions workflow on push to `main`
  (Vite `base` must be `/prabas_foodplanner/`)

## Architecture rules

- **Stock is event-based.** Never overwrite a quantity. Every change is a row in `stock_events`
  (+500 g bought, −200 g cooked, correction to 300 g). Current stock is derived from events.
  This lets both users edit at once without losing changes, and gives usage history.
- **Household scoping.** Every table has a `household_id`. Supabase Row Level Security must
  restrict all reads and writes to members of that household. No table without RLS.
- **Offline-first.** The app opens from the Dexie cache instantly, then syncs with Supabase.
  Queue writes made offline and replay them when back online.
- **Attribution.** Every write records `created_by` and `created_at`, shown in the UI as
  "Updated by you · 10 min ago".
- **Bilingual data.** Items and dishes always have `name_ta` (Tamil script) and `name_en`.
  Items also have an `aliases` list (English variants, Tanglish spellings, Hindi names, bill shorthand).
- **Transparent scoring.** Suggestion ranking lives in one pure, tested function with named
  weights. The "why" line on each suggestion card comes from its largest scoring factors.
- **Schema changes** go in SQL migration files under `supabase/migrations/`, never ad hoc.
- **Auth.** Use Supabase email OTP (6-digit code entered in the app), not magic links.
  Magic links open in Safari, not in the installed iPhone PWA, so the session lands in the wrong place.

## Design system

Colourful but calm. Colour always carries meaning. Never rely on colour alone; pair it with a label or icon.

| Role | Fill | Text / strong |
|---|---|---|
| Primary (banana leaf) | `#EAF3DE` | `#3B6D11` / `#27500A` |
| Highlight, tiffin and rice (turmeric) | `#FAEEDA` | `#BA7517` / `#633806` |
| Kuzhambu and gravies (coral) | `#FAECE7` | `#993C1D` |
| Pairings and sides (teal) | `#E1F5EE` | `#085041` |
| Rediscovery (purple) | `#EEEDFE` | `#3C3489` |
| Non-veg and urgent (red) | `#FCEBEB` | `#A32D2D` |
| Protein badge (blue) | `#E6F1FB` | `#0C447C` |
| Background (cream) | `#FBF8F1` | text `#2C2C2A` |

- Dark mode is required and switches automatically after sunset, with a manual override.
- Urgency order, used everywhere: red = use today or unknown, amber = soon or check, green = fine.
- Dish names are shown in both scripts. Each user picks which script shows first.
- Icons: one simple category icon per dish type (tiffin, rice, kuzhambu, poriyal, non-veg, drink).
- Bottom tab bar: Plan, Stock, Shop, Dishes. Settings sits behind an icon on Plan.
- Thumb-friendly: primary actions sit in the lower half of the screen.
- Actions apply immediately with an undo toast, instead of confirm dialogs.
  Exceptions that need a confirm: restore from backup, and deleting a dish.
- UI copy: sentence case, short, no exclamation marks.

## App identity

- Full name: PRABAS Food Planner. Short name (home-screen label): PRABAS.
- Icon: a single banana leaf set diagonally, with a clear central vein and an optional small
  turmeric-yellow dot, on a solid cream or turmeric background. Keep it inside the central 80%
  for Android maskable icons. Sizes: 180 (apple-touch-icon), 192, 512, and a 512 maskable.

## Batch status

- [x] Batch 1: Foundation (done 2026-09-29: installable PWA on both phones, email-code login,
      shared household with join code, offline cache and write queue, file and Drive backup.
      Supabase migrations 0001–0003 applied.)
- [x] Batch 2: Items and stock (done 2026-09-30: bilingual item list from a reviewed 198-item
      catalogue, event-based stock with exact undo, Stock screen, Add stock and item detail sheets,
      stock in backups and CSV. Migrations 0004–0005 applied. Two-phone test partly done.)
- [x] Batch 3: Dish library (done 2026-10-01: household dish library from a reviewed 120-dish
      catalogue with ranked sides, veg/non-veg worked out from ingredients, Dishes screen, detail sheet,
      add/edit/delete, dishes in backups. Migrations 0006–0007 applied. Tested on both phones.)
- [x] Batch 4: Plan and cook (done 2026-10-01: next-meal suggestions with named-weight scoring and
      why lines, bring-back card, plan/change/remove synced across phones, Cook this with editable
      deductions and exact undo, leftovers (Ready to eat), cooking history, meals in backups and CSV.
      Migration 0008 applied. Tested on both phones.)
- [x] Batch 5: Tamil calendar rules (done 2026-10-01: veg-only days (Saturdays by rule; Amavasai,
      Kiruthigai, Puratasi from published calendars, confirmed in the app), non-veg rhythm, Plan chip and
      filtering, Calendar screen, calendar in backups. Migrations 0009-0010 applied. Tested on both phones.)
- [x] Batch 6: Prepared items and multi-day batches (done 2026-10-01: 10 prepared items from a reviewed
      catalogue (one idli/dosa batter, a separate paruppu dosa batter, koozh, dough, paste, podi, thokku),
      event-based batches with stage prompts, planning backwards, late-step shifting, learned ferment time,
      keep it going, the In progress strip on Plan, cooking from batches, ready batches on Stock, batches in
      backups. Migrations 0011–0012 applied. Tested on both phones.)
- [x] Batch 7: Shopping list (done 2026-10-01: a list that builds itself from running-low stock, planned
      meals and batches over the next 3 days, and a separate "Might need" for likely meals; one line per item
      with its reasons; ticking off adds to stock with the usual amount and undo; skip, add by hand in both
      scripts, share to WhatsApp; fish or meat card for non-veg days; no meat, fish or egg listed in
      Puratasi or on veg-only days; tab count; shopping list in backups. Migration 0013 applied. Tested on
      both phones.)
- [x] Batch 8: Reminders (done 2026-10-01: Web Push on both phones with the app closed; the phones work
      out upcoming reminders (batch steps, night-before prep, fish or meat to buy, staples running low,
      batches about to finish) into a reminders table, and the send-reminders Edge Function, called every
      15 minutes by pg_cron, sends what's due; per-person kinds, evening time and quiet hours; turn on per
      phone, send a test, iPhone Home Screen note. Migrations 0014–0015 applied; setup in
      docs/REMINDERS_SETUP.md. Tested on both phones.)
- [x] Batch 9: Nutrition (done 2026-10-02: seven food groups from cooked meals over 14 days (legumes
      weighted highest), real gaps only after 10 meals over a week, nutrition weight live in scoring with veg
      protein favoured on veg-only days, swap line on suggestion cards (kids' favourites first), at most two
      Shop nudges with one-tap add and a dish idea, Plan summary card and Food balance screen. No migration.
      Card and screen seen on the phones; gaps, swaps and nudges tested in code, to be seen once two weeks of
      cooking are logged.)
- [ ] Batch 10: Bill scanning
