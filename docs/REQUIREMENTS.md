# PRABAS Food Planner: requirements

## Household context

- Family of five, cooking mostly Tamil / South Indian food, plus non-veg dishes.
- Meals are planned **one at a time**: breakfast, lunch, or dinner, whichever is needed next.
- Main moment of use: the night before, deciding the next day's meal quickly.
- Two users share all data in real time: Raj (iPhone) and his wife (Android).
- Onion and garlic are used freely on all days.

## Food rules (used from Batch 5 on)

- **No non-veg** (meat, fish, **and eggs**) on: Amavasai, Kiruthigai, every Saturday, and the whole month of Puratasi.
- **Non-veg target:** twice a week. Sunday is preferred. The second day is midweek (Wednesday or Thursday), at least two days from the other.
- If a preferred non-veg day is restricted, move it to the nearest allowed day and re-space the other.
- During Puratasi, the non-veg rhythm pauses. When Puratasi ends, suggest a non-veg day to mark the return.
- On a non-veg day, any or all of the three meals can be non-veg.

## Nutrition goal (used in Batch 9)

Slightly increase **protein and fibre**, through small swaps within familiar meals rather than a diet overhaul.

---

## Batch 1: Foundation

**Goal:** an installable, empty-shell PWA on both phones, with login, a shared household, and backups working.

Scope:
- Vite + React + TypeScript project with Tailwind, React Router, Dexie, and `vite-plugin-pwa`.
- PWA manifest: name "PRABAS Food Planner", short name "PRABAS", theme colours from the design system, banana-leaf icons in all required sizes (generate simple SVG-based placeholders now, replaceable later).
- Service worker: cache the app shell for offline use. Let cross-origin requests (Supabase, Google sign-in, Drive) pass straight through.
- GitHub Actions workflow that builds and deploys to GitHub Pages on push to `main`.
- A `push.bat` in the repo root, same pattern as MealFast's: show changes, ask for a commit message, commit, push.
- Supabase client setup, reading URL and anon key from environment variables.
- Auth with email OTP (6-digit code). Screens: enter email, enter code.
- Tables: `households`, `household_members`, `profiles` (display name, script preference `ta_first` or `en_first`, theme preference). RLS on all.
- First login creates a household. A simple invite flow lets the second person join (for example, a join code shown in Settings).
- App shell: bottom tab bar (Plan, Stock, Shop, Dishes) with placeholder screens, a Settings screen, and the full colour system including dark mode.
- Offline cache and write-queue plumbing in Dexie, ready for later tables.
- Backup, as specified in `docs/DRIVE_BACKUP.md`: JSON export, CSV export, JSON import, and Google Drive backup with rolling copies.

Manual steps for Raj (Claude Code should list these clearly when needed):
- Create a Supabase project and put its URL and anon key in `.env.local`, and in GitHub repository secrets for the deploy workflow.
- Apply the SQL migrations (Supabase SQL editor, or the Supabase CLI).
- Enable email OTP in Supabase Auth settings.
- In Google Cloud, add the GitHub Pages address as an authorised JavaScript origin on the OAuth client, and add any Google account that will connect Drive as a test user if the consent screen is in testing mode.
- In the GitHub repo settings, set Pages to deploy from GitHub Actions.

Done when:
- The app installs from Safari on iPhone and Chrome on Android, and opens full-screen with the PRABAS icon.
- Both users can log in and see the same household.
- It opens offline to the app shell.
- Drive backup connects, backs up, and restores. JSON export and import round-trip correctly.

## Batch 2: Items and stock

**Goal:** a working bilingual inventory that both users can keep accurate with minimal effort.

Scope:
- `items` table: `name_ta`, `name_en`, `aliases[]`, category (vegetable, greens, fruit, meat, fish, egg, dairy, grain, dal, spice, oil, other), default unit, default shelf life in days, `is_staple`, low threshold, and an optional per-piece or per-bunch weight for conversions.
- Seed around 200 common items with Tamil names and aliases (English, Tanglish, Hindi, and common bill shorthand). Examples: வெண்டைக்காய் = vendakkai, ladies finger, lady finger, okra, bhindi, L.Finger.
- `stock_events` table: item, delta or absolute correction, unit, reason (bought, cooked, correction, spoiled, used), `created_by`, `created_at`. Current stock is computed from events.
- Freshness: each purchase batch tracks its own expected expiry from the item's default shelf life, which the user can override.
- Stock screen grouped by urgency: "Use soon" (expiring), "Running low" (below threshold), and "All good" (collapsed count).
- Natural units: kg and g, pieces, bunches, litres and ml, packets.
- +/− steppers on every row, swipe to mark used up, and an undo toast.
- Staples (onion, tomato, coconut, curry leaves, coriander, green chilli, ginger, curd, milk, oil, rice, toor dal, urad dal): alert in **days left**, learned from usage history, with a buffer for untracked use. A plain quantity threshold is also allowed.
- Coconut: track whole and opened separately. Opened coconut has a short shelf life (about 3 days).
- Search that matches Tamil script, English, Tanglish variants, and aliases.
- Attribution line on changes.

Done when:
- Both users can add and adjust stock, and see each other's changes in real time.
- Simultaneous edits to the same item both survive.
- Search finds வெண்டை, "vendakkai", "vendakai", and "okra" as the same item.

## Batch 3: Dish library

**Goal:** a rich, editable library of family dishes with pairings.

Scope:
- `dishes` table: `name_ta`, `name_en`, type (tiffin, variety rice, kuzhambu, sambar, rasam, poriyal, kootu, chutney, non-veg gravy, non-veg fry, drink, snack), suitable meals (breakfast, lunch, dinner), veg or non-veg (egg counts as non-veg), ingredients with quantities **scaled for five people**, nutrition tags (protein-rich, fibre-rich, greens, millet, fish, legume, curd), and an optional prep plan (used in Batch 6).
- `dish_pairings`: each main dish has two or three recommended sides, ranked. Examples: Pongal with brinjal sambar and coconut chutney. Lemon rice with potato fry.
- Seed around 100 Tamil and non-veg dishes, including ones that often fall out of rotation (poondu kuzhambu, kollu rasam, karamani kuzhambu, ragi koozh, adai, pesarattu). Quantities are starting estimates and are clearly editable.
- Flags per dish: favourite, kids' favourite, and "don't suggest".
- Dishes screen: search in both scripts, filter by type, meal, favourites, and hidden. Dish detail shows pairings, ingredients, tags, and cooking history.

Done when:
- The library opens with the seeded dishes, and any dish can be edited, favourited, or hidden.

## Batch 4: Plan and cook

**Goal:** the core loop. Plan the next meal in under a minute, cook it, and have stock update itself.

Scope:
- Plan screen: date, meal switcher (auto-selects the next upcoming meal), and three or four combo suggestion cards.
- Each card: category icon, main dish in both scripts, pairing chips, a "why" line, a last-cooked note ("Cooked 45 days ago", "Not cooked yet"), and badges for protein, fibre, favourite, and kids' favourite.
- Tapping a pairing chip opens a bottom sheet of alternative sides.
- One slot per plan is a **rediscovery pick**: a liked dish not cooked for a long time, styled differently ("Bring back?").
- Scoring function (pure, tested) with named, tunable weights. Starting factors: uses items near expiry, ingredients in stock, favourite, kids' favourite, days since last cooked (rising score), and later calendar fit and nutrition gaps. Dishes marked "don't suggest" never appear.
- A combo missing ingredients still appears, with a "needs curd" note, rather than being hidden.
- "Cook this" opens a sheet previewing stock deductions, each line editable, then confirms with one tap and writes `stock_events`.
- `meal_history`: date, meal, dishes, who confirmed it.
- Leftovers: after cooking, optionally mark leftover servings of a dish. Leftovers appear in a "Ready to eat" stock section with a short shelf life, and in later suggestions (for example, dosa with the leftover curry).
- Plan visibility: once one user confirms a meal, the other sees it as planned instead of fresh suggestions.

Done when:
- Choosing a combo takes a few taps, stock updates correctly, and history records it.
- Suggestions visibly change as stock ages and dishes get cooked.

## Batch 5: Tamil calendar rules

**Goal:** suggestions respect the family's food rules automatically.

Scope:
- `calendar_days` table: date, type (amavasai, kiruthigai, puratasi, family_custom), label, and a `verified` flag.
- Seed file for 2026 and 2027 with a clear note that dates must be checked against a trusted panchangam. **Do not invent dates.** Leave entries marked unverified where unsure, and show unverified days in the calendar screen for Raj to confirm or edit.
- Saturdays are a rule, not data.
- A calendar screen to view, add, edit, and remove restricted days, including one-off family days.
- Plan screen context chip: "Saturday · veg only", "Puratasi · veg only", or "Non-veg day".
- Filter: on restricted days, non-veg dishes (including egg) never appear.
- Non-veg rhythm, following the food rules above. Its scoring nudges non-veg combos on target days.

Done when:
- A Saturday, an Amavasai, and any Puratasi date never show non-veg.
- Non-veg lands on Sunday and midweek, and shifts correctly around restricted days (tested with unit tests).

## Batch 6: Prepared items and multi-day batches

**Goal:** handle batter, ragi koozh, and other prepared items properly.

Scope:
- Prep plans on dishes: ordered stages, each with a name, duration, and whether it needs an action. Examples:
  - Ragi koozh: soak (night, 8 to 10 hours), cook (next day), ferment (one day), ready (drink over 2 to 3 days).
  - Dosa or idli batter: soak, grind, ferment, ready (a set number of meals).
  - Also: kambu koozh, pazhaya sadam, soaked chana.
- `batches` table: dish, current stage, stage timestamps, yield, remaining amount, and expiry.
- Units for prepared items: batter counts in **meals** (for example, one grind = 4 meals for 5 people). Koozh counts in **glasses**.
- Plan backwards: "Koozh for Thursday" schedules soak on Tuesday night and cook on Wednesday. Or start a batch directly ("Soaked ragi today").
- Raw ingredients are deducted once, at the soak or cook stage.
- "In progress" strip on the Plan screen: "Ragi koozh · fermenting", "Dosa batter · 2 meals left".
- Ageing batter pushes uthappam or kuzhi paniyaram in suggestions. One meal left prompts "Grind batter tonight".
- If a stage isn't confirmed on time, shift the timeline and ask whether to keep the plan.
- Optional "keep it going" per prepared item: prompt the next batch when the current one is nearly finished.
- Adjustable ferment duration per batch (faster in hot weather), with the app learning the usual timing.
- Prepared staples like chapati dough, puliyogare paste, idli podi, and thokku also count in meals.

Done when:
- A ragi koozh batch moves through all stages with the right prompts, and its glasses count down as they're used.

## Batch 7: Shopping list

**Goal:** one list that fills itself, and restocking that needs no separate data entry.

Scope:
- Auto-built sections: staples running low, and ingredients for planned or suggested meals. Each item shows why it's there.
- Manual add, with search in both scripts.
- **Checking off an item adds it to stock**, through a quick quantity sheet pre-filled with the usual amount.
- Share to WhatsApp as plain text, with Tamil and English names.
- Fish and meat buying reminders for non-veg days appear here too.
- During Puratasi, meat and fish are never listed as missing.

Done when:
- Checking an item off updates stock immediately, for both users.

## Batch 8: Reminders

**Goal:** timely push notifications on both phones, even when the app is closed.

Scope:
- Web Push with VAPID keys. A `push_subscriptions` table per device. Push works on iPhone only when the app is installed to the home screen (iOS 16.4 or later); the Settings screen should explain this.
- A scheduled Supabase job (for example, every 15 minutes) that sends due reminders.
- Reminder types: night-before prep (soak, grind, defrost), batch stages, buy fish or meat tomorrow, staples running low, and batches about to expire.
- Per-user settings: which reminder types to receive, the evening reminder time, and quiet hours.

Done when:
- A soak reminder arrives on both phones at the set evening time with the app closed.

## Batch 9: Nutrition

**Goal:** gentle nudges toward more protein, fibre, and variety.

Scope:
- Rolling two-week food-group tracking from `meal_history`: greens, protein, legumes, vegetable variety (count of distinct vegetables), millets, fish, and curd.
- Protein and fibre focus: legumes (channa, green gram, karamani, kollu) weighted highest, and swap suggestions within familiar meals (adai or pesarattu for plain dosa, kootu or sundal as extra sides, kaikuthal arisi or millet rice).
- On restricted days and during Puratasi, give extra weight to veg protein.
- Scoring boost for dishes that cover a missing food group.
- Shopping-list nudges: **at most two** per list, each with a one-tap add and a dish idea. Example: "No keerai in 10 days. Add murungai keerai?"
- Weekly summary view: for example, "Protein-rich meals: 8 of 21" and days with greens.
- Prefer kids' favourites when choosing swaps.

Done when:
- Nudges appear only for real gaps, never more than two per list.

## Batch 10: Bill scanning

**Goal:** photograph a bill and add everything to stock after a quick review.

Scope:
- Photo capture or upload from the phone.
- A Supabase Edge Function sends the image to the Anthropic API (a current Claude model with vision) and returns structured lines: raw name, quantity, unit, and price. The API key stays in Supabase secrets.
- Matching pipeline, per line: clean up text, then check exact aliases, then fuzzy match (typos and misreads), then AI suggestion, then mark unknown. Ignore non-grocery lines (carry bag, discount, total).
- Review screen, sorted by attention needed: "Needs mapping" (red, with search to map or create an item), "Check these" (amber, low-confidence matches with one-tap accept), and "Matched" (collapsed count).
- Ambiguous names (beans, chilli, greens) always ask. Remember each vendor's usual meaning.
- Price without quantity ("Brinjal 40"): estimate the quantity from the usual price per kg, and let the user adjust.
- Tamil-script and handwritten bills are supported.
- Every manual mapping is saved as a new alias for the household.
- Confirm once to add all lines as `stock_events`.

Done when:
- A photo of a typical vegetable bill goes into stock in under a minute, and a name mapped once matches automatically next time.
