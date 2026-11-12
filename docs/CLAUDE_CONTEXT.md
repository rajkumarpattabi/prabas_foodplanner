# Claude context handoff

Loaded automatically through `CLAUDE.md` (`@docs/CLAUDE_CONTEXT.md`). It carries what Claude
learned while building the app on Raj's first laptop: decisions, workflow and gotchas that
aren't obvious from the code or git history. Written 2026-11-12 when moving to a new laptop.
Keep it current: when something here goes stale, fix it in the same commit.

## Where things stand

- All ten batches in `docs/REQUIREMENTS.md` are built, tested on both phones and marked done in
  `CLAUDE.md`. Anything now is a new request, not a batch. For new features, still propose a short
  plan and wait for approval before building.
- Work since Batch 10 (October 2026):
  - **Dishes added from Raj's lists**, as migrations 0017 to 0020 (138 → 182 dishes, 198 → 204 items).
    They must be applied in order; each is safe to run again. **Check with Raj whether all four
    have been pasted into Supabase.**
  - **Three library-only dish types:** `sweet`, `juice` (and lassi), `salad_soup`. They show in
    Dishes with their own filter, and are never a Plan main or a side (`STANDALONE`/`SIDE_TYPES`
    in `src/plan/combos.ts` and `src/dishes/rules.ts`). Semiya payasam moved from snack to sweet.
  - **New app icon:** a sadya photo (see App identity in `CLAUDE.md`; the credit line in Settings
    is required by its CC BY 2.0 licence).
  - **A user manual video for Baskari** (Raj's wife), see below.
- Known untested-in-real-life areas: Batch 2's two-phone test was only partly done (simultaneous
  edits of one item, offline replay, restore). Batch 9's gaps, swaps and Shop food cards need about
  two weeks of logged cooking before they appear.
- Small idea noticed but not done: on Shop, "Might need" repeats the same reason for each meal
  slot (e.g. "For pesarattu" three times). Offered to Raj; not asked for yet.

## Raj's environment and how we work

- Corporate Windows laptop, no admin rights (can't approve UAC). No Supabase CLI, Docker or `gh`.
  The Node firewall pop-up from the dev server can be cancelled; it's harmless.
- **Migrations:** Raj pastes them into the Supabase SQL editor. It doesn't show `raise notice`,
  so check scripts end with a `select '… passed' as result` row. Test SQL first with PGlite (below).
- **Pushing:** Claude commits, Raj pushes with `push.bat`. The GitHub Actions deploy follows.
- Raj tests on his iPhone (installed PWA); Baskari tests on her Android phone.
- Give manual steps as short numbered click-paths, and say which step he's at. He often steps
  away and expects work to continue.
- Google OAuth app ("PRABAS") stays in Testing mode, so Drive asks for re-consent about weekly
  ("Sign-in needed to sync"; tapping Sync now fixes it).
- No LLM API key, so nothing in the app calls an AI model.
- Commit messages: from PowerShell 5.1, double quotes in native arguments get mangled. Write the
  message to a temp file and run `git commit -F <file>` from Bash.
- Don't put Raj's email in request headers or payloads to outside sites (e.g. a User-Agent).

## Testing gotchas

- **CI is slower** than the laptop and has no `.env.local`. `src/test/setup.ts` sets
  `asyncUtilTimeout: 5000`; `vitest.config.ts` sets `testTimeout: 20_000`. Check the exit code and
  any "Unhandled" lines, not just the pass count: Vitest fails a run on unhandled errors even when
  every test passes. Providers skip setState after unmount via a mounted ref for this reason.
- To check what CI will do: clone into a temp folder, junction-link `node_modules`
  (`cmd //c mklink /J`), run `npx vitest run --maxWorkers=2`.
- **PGlite harness for SQL** (`@electric-sql/pglite`, installed in a temp folder, not the repo):
  create roles `anon`/`authenticated`, an `auth` schema with `auth.users` and `auth.uid()` reading
  `request.jwt.claims`, a `supabase_realtime` publication and default grants; then run the
  migrations in order (skip 0015's pg_cron error). For catalogue migrations, test two paths:
  an existing household built from the old 0005/0007 (`git show <old>:…`) then the new migration,
  and a fresh database. Use Windows-style paths in Node.
- **Visual checks:** Claude can't sign in to the real Supabase. Use a throwaway `preview-*.html`
  page with in-memory contexts (or the test fakes), and delete it afterwards. Under mobile
  emulation, browser-pane screenshots can go stale; re-apply the viewport and check the DOM.
- Tests fix "today" with `renderApp({ now })`, or a movable `renderApp({ clock })` (move it,
  then dispatch a window focus event). `src/test/fakeHousehold.ts` is the in-memory backend.

## Catalogues

- Items, dishes, calendar and prepared items are edited in `supabase/seed/*.psv`, then
  `npm run catalog` regenerates migrations 0005, 0007, 0010, 0012 and the `docs/*.md` lists. It
  stops if a dish names an unknown item or side.
- For a database that already exists, also write a new numbered migration with **only the
  additions/changes** (generate rows with `dishCatalogToSql`/`catalogToSql` on the new keys) that
  ends with `select private.seed_household_items/dishes(id) from public.households`.
- Lesson from 0019: never regenerate a whole catalogue row for a dish 0012 changed (chapati,
  dosa, idli, koozh…): it would undo the prepared-item setup. Update only the field that changed.
- Household updates must only touch rows still at the old value, so a family's own edits survive.
- Ingredients are for five people, in the item's stored unit. Veg/non-veg is derived from
  ingredients (egg counts as non-veg); brownie and tiramisu were made eggless on purpose.
- `src/dishes/catalog.test.ts` lists the tiffin/rice mains eaten without a side (sweet pongal,
  pasta, noodles, sandwiches, toast); add to it deliberately.

## Decisions by area (for future changes)

- **Stock (Batch 2):** exact undo returns stock to the same purchases with their original expiry
  (`batch_id` on delta events); each purchase stores its expiry date explicitly.
- **Dishes (3):** pairings are ranked `side_ids` on the dish (a delete trigger cleans up);
  ingredients are jsonb `[{item_id, quantity, optional?}]`; all household table sync goes through
  `src/offline/useTableSync.ts`.
- **Plan (4):** `meals` id is `<household>:<date>:<meal>`. Scoring is `src/plan/score.ts` with named
  `WEIGHTS` (calendar 3, nutrition 3). Gravy mains get plain rice (`sadam`) as the combo base.
  Keep Plan's sheets in one stable place (`withSheets`).
- **Calendar (5):** 2026–27 dates were read from published Chennai panchangam sites, never
  computed; where sources disagreed both days were seeded for Raj to confirm. Adding 2028+ means
  looking them up the same way. UI dates use `formatDay`, never `toLocaleDateString`. Screens get
  "today" from `useClock`.
- **Prepared items (6):** a prepared item is a dish with `prep_plan`; `dish.ingredients` is only what's
  added when serving. `batches` rows never change; everything after the start is an append-only
  `batch_events` row, replayed by `batchState()`.
- **Shop (7):** the list is computed (`src/shop/build.ts`), only want/skip rows are stored. Ticking off
  goes through `BoughtForm`.
- **Reminders (8):** phones compute reminders into the `reminders` table; the `send-reminders` Edge
  Function (pg_cron every 15 min, `x-cron-secret`; Verify JWT off) sends them. Changing the function
  means Raj pastes `index.ts` and `rules.ts` into the dashboard editor. A new reminder type touches
  `REMINDER_TYPES`, two CHECK constraints (new migration) and `DEFAULT_PERSON`. Setup is in
  `docs/REMINDERS_SETUP.md`.
- **Nutrition (9):** `src/nutrition/` (groups, balance, swaps, nudges with `MAX_NUDGES = 2`).
- **Bills (10):** read on the phone with Tesseract.js (eng+tam, lazy-loaded, engine cached by a
  workbox rule for `cdn.jsdelivr.net/npm/tesseract*`), or pasted from Google Lens / Live Text.
  Pure tested modules in `src/bills/`; `/scan` screen. A whole-page contrast stretch blackened
  shadowed paper, so only a local threshold is used. A Claude step could slot in at the "closest
  guesses" stage of `src/bills/match.ts` if Raj ever gets an API key.

## The user manual video

- An 8.5-minute narrated video for Baskari (Zira voice, captions, highlight boxes), made
  2026-10-03. Its harness lives in `manual-video/`, which is **not in git** (listed in
  `.git/info/exclude` on the old laptop), so it won't come across by pulling. If Raj wants to
  re-record later, he should copy that folder over by hand (about 250 MB with the videos).
- How it worked: `manual-video/app.tsx` ran the real app on the test fakes (with a `vitest` shim
  and a PWA shim, its own Vite config on port 5174), seeded from the migrations dumped through
  PGlite, clock fixed at 20 Oct 2026 9:15 pm. Screens were captured at 390×844, narration made
  with PowerShell `System.Speech`, and `compose.html` recorded canvas + audio with MediaRecorder.
  It predates migrations 0017–0020 and the new icon.
