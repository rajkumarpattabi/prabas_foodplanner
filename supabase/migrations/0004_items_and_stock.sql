-- ============================================================================
-- PRABAS Food Planner · 0004 items and stock
--
-- items:        each household's own bilingual item list (seeded from a catalogue)
-- stock_events: every change to stock, append-only. Current stock is replayed from
--               these in the app (src/stock/computeStock.ts); nothing is overwritten,
--               so two phones editing the same item at once both count.
--
-- The starter catalogue rows are loaded by 0005_item_catalog.sql.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Items
-- ---------------------------------------------------------------------------

create table public.items (
  id                     uuid primary key default gen_random_uuid(),
  household_id           uuid not null references public.households (id) on delete cascade,
  -- Which catalogue entry it was seeded from; null for items the household added.
  catalog_key            text,
  name_ta                text not null check (char_length(btrim(name_ta)) between 1 and 80),
  name_en                text not null check (char_length(btrim(name_en)) between 1 and 80),
  aliases                text[] not null default '{}' check (cardinality(aliases) <= 40),
  category               text not null check (category in (
                           'vegetable', 'greens', 'fruit', 'meat', 'fish', 'egg', 'dairy',
                           'grain', 'dal', 'spice', 'oil', 'other')),
  -- Stored unit. Fixed once created, so past events keep their meaning.
  unit                   text not null check (unit in ('g', 'ml', 'piece', 'bunch', 'packet')),
  display_unit           text not null,
  shelf_life_days        int check (shelf_life_days > 0),
  is_staple              boolean not null default false,
  low_threshold          numeric check (low_threshold >= 0),
  piece_weight_g         numeric check (piece_weight_g > 0),
  has_opened_form        boolean not null default false,
  opened_shelf_life_days int check (opened_shelf_life_days > 0),
  step                   numeric not null check (step > 0),
  archived               boolean not null default false,
  created_by             uuid references auth.users (id) on delete set null default auth.uid(),
  created_at             timestamptz not null default now(),
  updated_by             uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at             timestamptz not null default now(),
  unique (household_id, catalog_key),
  -- Lets stock_events require that its item is in the same household.
  unique (id, household_id),
  check (
    display_unit = unit
    or (unit = 'g' and display_unit = 'kg')
    or (unit = 'ml' and display_unit = 'l')
  )
);

create index items_household on public.items (household_id);

create trigger stamp_update before update on public.items
  for each row execute function private.stamp_update();

-- ---------------------------------------------------------------------------
-- Stock events (append-only)
-- ---------------------------------------------------------------------------

create table public.stock_events (
  -- Made on the phone, so replaying the offline queue can never add an event twice.
  id           uuid primary key,
  household_id uuid not null,
  item_id      uuid not null,
  kind         text not null check (kind in ('delta', 'set', 'expiry', 'open')),
  -- In the item's stored unit.
  quantity     numeric not null,
  reason       text check (reason in ('bought', 'cooked', 'used', 'spoiled', 'correction')),
  -- For kind 'expiry': the purchase (event id) whose date changes.
  batch_id     uuid,
  expires_on   date,
  form         text not null default 'whole' check (form in ('whole', 'opened')),
  note         text check (char_length(note) <= 200),
  -- When it happened on the phone; offline changes keep their real time.
  occurred_at  timestamptz not null default now(),
  created_by   uuid references auth.users (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  foreign key (item_id, household_id) references public.items (id, household_id) on delete cascade,
  check (kind <> 'set' or quantity >= 0),
  check (kind <> 'open' or quantity > 0),
  check (kind <> 'expiry' or (batch_id is not null and expires_on is not null))
);

create index stock_events_household on public.stock_events (household_id, occurred_at);
create index stock_events_item on public.stock_events (item_id, occurred_at);

-- ---------------------------------------------------------------------------
-- Catalogue: the starter items every new household gets a copy of.
-- Hidden from the app (private schema); rows are loaded by 0005.
-- ---------------------------------------------------------------------------

create table private.item_catalog (
  key                    text primary key,
  name_ta                text not null,
  name_en                text not null,
  aliases                text[] not null default '{}',
  category               text not null,
  unit                   text not null,
  display_unit           text not null,
  shelf_life_days        int,
  is_staple              boolean not null default false,
  low_threshold          numeric,
  piece_weight_g         numeric,
  has_opened_form        boolean not null default false,
  opened_shelf_life_days int,
  step                   numeric not null
);

-- Copies catalogue items into a household. Safe to run again: existing ones are skipped.
create function private.seed_household_items(p_household uuid) returns int
language plpgsql
set search_path = ''
as $$
declare
  n int;
begin
  insert into public.items (
    household_id, catalog_key, name_ta, name_en, aliases, category, unit, display_unit,
    shelf_life_days, is_staple, low_threshold, piece_weight_g, has_opened_form,
    opened_shelf_life_days, step, created_by, updated_by
  )
  select p_household, c.key, c.name_ta, c.name_en, c.aliases, c.category, c.unit, c.display_unit,
         c.shelf_life_days, c.is_staple, c.low_threshold, c.piece_weight_g, c.has_opened_form,
         c.opened_shelf_life_days, c.step, null, null
  from private.item_catalog c
  on conflict (household_id, catalog_key) do nothing;
  get diagnostics n = row_count;
  return n;
end
$$;

-- New households start with the catalogue. (Same as 0001, plus the seeding line.)
create or replace function public.create_household(p_name text) returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  hid uuid;
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if exists (select 1 from public.household_members where user_id = uid) then
    raise exception 'Already in a household' using errcode = 'P0001';
  end if;

  insert into public.households (name, join_code, backup_owner_id, created_by, updated_by)
  values (btrim(p_name), private.new_join_code(), uid, uid, uid)
  returning id into hid;

  insert into public.household_members (household_id, user_id, role, created_by)
  values (hid, uid, 'owner', uid);

  perform private.seed_household_items(hid);

  return hid;
end
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.items        enable row level security;
alter table public.stock_events enable row level security;

revoke all on public.items, public.stock_events from anon, authenticated;
grant select, insert on public.items, public.stock_events to authenticated;
-- Everything about an item can be edited except where it lives and its stored unit.
grant update (
  name_ta, name_en, aliases, category, display_unit, shelf_life_days, is_staple, low_threshold,
  piece_weight_g, has_opened_form, opened_shelf_life_days, step, archived
) on public.items to authenticated;
-- No update or delete on stock_events at all: events are append-only.

create policy "Members read their items"
  on public.items for select to authenticated
  using (public.is_member(household_id));

create policy "Members add items, as themselves"
  on public.items for insert to authenticated
  with check (public.is_member(household_id) and created_by = auth.uid());

create policy "Members edit their items"
  on public.items for update to authenticated
  using (public.is_member(household_id))
  with check (public.is_member(household_id));

create policy "Members read their stock events"
  on public.stock_events for select to authenticated
  using (public.is_member(household_id));

create policy "Members add stock events, as themselves"
  on public.stock_events for insert to authenticated
  with check (public.is_member(household_id) and created_by = auth.uid());

-- ---------------------------------------------------------------------------
-- Backup: restore replaces items and their events (see 0002). Same as 0002 plus
-- the two restore_replace lines at the end.
-- ---------------------------------------------------------------------------

create or replace function public.restore_snapshot(p_tables jsonb) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  hid uuid;
begin
  select m.household_id into hid
  from public.household_members m
  join public.households h on h.id = m.household_id
  where m.user_id = uid and h.backup_owner_id = uid;
  if hid is null then
    raise exception 'Only the backup owner can restore' using errcode = '42501';
  end if;
  if p_tables is null or jsonb_typeof(p_tables) <> 'object' then
    raise exception 'Not a backup' using errcode = '22023';
  end if;

  update public.profiles p
  set display_name = coalesce(b.display_name, p.display_name),
      script_pref  = coalesce(b.script_pref, p.script_pref),
      theme_pref   = coalesce(b.theme_pref, p.theme_pref)
  from jsonb_populate_recordset(null::public.profiles, coalesce(p_tables -> 'profiles', '[]'::jsonb)) b
  where p.user_id = b.user_id
    and exists (select 1 from public.household_members m where m.household_id = hid and m.user_id = p.user_id);

  -- Items first (replacing them also clears their events), then the events.
  -- A backup made before Batch 2 has neither, and leaves items and stock as they are.
  if p_tables ? 'items' then
    perform private.restore_replace('items', hid, p_tables -> 'items');
    perform private.restore_replace('stock_events', hid, p_tables -> 'stock_events');
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Real-time: both phones see stock and item changes live (RLS applies).
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.items, public.stock_events;
