-- ============================================================================
-- PRABAS Food Planner · 0006 dishes
--
-- dishes: each household's own bilingual dish library (seeded from a catalogue).
--   ingredients: [{item_id, quantity, optional?}] for five people, in each item's
--                stored unit. A recipe is always edited as a whole, so it's one column.
--   side_ids:    recommended sides, best first. Deleting a dish removes it from
--                every other dish's sides (trigger below), so nothing dangles.
--   is_veg:      worked out from the ingredients (meat, fish or egg → non-veg) by the
--                app (src/dishes/rules.ts) and by the seeding function here.
--
-- The starter catalogue rows are loaded by 0007_dish_catalog.sql.
-- ============================================================================

create table public.dishes (
  id                uuid primary key default gen_random_uuid(),
  household_id      uuid not null references public.households (id) on delete cascade,
  -- Which catalogue entry it was seeded from; null for dishes the household added.
  catalog_key       text,
  name_ta           text not null check (char_length(btrim(name_ta)) between 1 and 80),
  name_en           text not null check (char_length(btrim(name_en)) between 1 and 80),
  aliases           text[] not null default '{}' check (cardinality(aliases) <= 40),
  type              text not null check (type in (
                      'tiffin', 'variety_rice', 'kuzhambu', 'sambar', 'rasam', 'poriyal', 'kootu',
                      'chutney', 'nonveg_gravy', 'nonveg_fry', 'drink', 'snack')),
  meals             text[] not null default '{}'
                      check (meals <@ array['breakfast', 'lunch', 'dinner']::text[]),
  is_veg            boolean not null default true,
  tags              text[] not null default '{}'
                      check (tags <@ array['protein', 'fibre', 'greens', 'millet', 'fish', 'legume', 'curd']::text[]),
  ingredients       jsonb not null default '[]'
                      check (jsonb_typeof(ingredients) = 'array' and jsonb_array_length(ingredients) <= 60),
  side_ids          uuid[] not null default '{}' check (cardinality(side_ids) <= 10),
  -- Stages for prepared items such as batter and koozh; shaped and used from Batch 6.
  prep_plan         jsonb,
  is_favourite      boolean not null default false,
  is_kids_favourite boolean not null default false,
  -- Kept in the library, never suggested.
  dont_suggest      boolean not null default false,
  notes             text check (char_length(notes) <= 1000),
  created_by        uuid references auth.users (id) on delete set null default auth.uid(),
  created_at        timestamptz not null default now(),
  updated_by        uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at        timestamptz not null default now(),
  unique (household_id, catalog_key),
  -- A dish is never its own side.
  check (not (id = any (side_ids)))
);

create index dishes_household on public.dishes (household_id);

create trigger stamp_update before update on public.dishes
  for each row execute function private.stamp_update();

-- A deleted dish leaves every other dish's sides.
create function private.forget_deleted_side() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.dishes
  set side_ids = array_remove(side_ids, old.id)
  where household_id = old.household_id and old.id = any (side_ids);
  return null;
end
$$;

create trigger forget_deleted_side after delete on public.dishes
  for each row execute function private.forget_deleted_side();

-- ---------------------------------------------------------------------------
-- Catalogue: the starter dishes every new household gets a copy of.
-- Ingredients and sides name catalogue keys; seeding maps them to the household's
-- own items and dishes. Hidden from the app (private schema); rows loaded by 0007.
-- ---------------------------------------------------------------------------

create table private.dish_catalog (
  key         text primary key,
  name_ta     text not null,
  name_en     text not null,
  aliases     text[] not null default '{}',
  type        text not null,
  meals       text[] not null default '{}',
  tags        text[] not null default '{}',
  -- [{item: <item catalogue key>, quantity, optional?}]
  ingredients jsonb not null default '[]',
  -- Dish catalogue keys, best first.
  sides       text[] not null default '{}',
  notes       text
);

-- Copies catalogue dishes into a household. Safe to run again: existing dishes are
-- skipped, and only newly added dishes get their sides filled in (so sides someone
-- removed on purpose stay removed).
create function private.seed_household_dishes(p_household uuid) returns int
language plpgsql
set search_path = ''
as $$
declare
  added uuid[];
begin
  with ins as (
    insert into public.dishes (
      household_id, catalog_key, name_ta, name_en, aliases, type, meals, tags,
      ingredients, is_veg, notes, created_by, updated_by
    )
    select
      p_household, c.key, c.name_ta, c.name_en, c.aliases, c.type, c.meals, c.tags,
      coalesce((
        select jsonb_agg(
                 jsonb_build_object('item_id', i.id, 'quantity', (x.v ->> 'quantity')::numeric)
                 || case when (x.v ->> 'optional')::boolean then '{"optional": true}'::jsonb else '{}'::jsonb end
                 order by x.ord)
        from jsonb_array_elements(c.ingredients) with ordinality as x (v, ord)
        join public.items i on i.household_id = p_household and i.catalog_key = x.v ->> 'item'
      ), '[]'::jsonb),
      not exists (
        select 1
        from jsonb_array_elements(c.ingredients) x (v)
        join public.items i on i.household_id = p_household and i.catalog_key = x.v ->> 'item'
        where i.category in ('meat', 'fish', 'egg')
      ),
      c.notes, null, null
    from private.dish_catalog c
    on conflict (household_id, catalog_key) do nothing
    returning id
  )
  select coalesce(array_agg(id), '{}') into added from ins;

  update public.dishes d
  set side_ids = coalesce((
    select array_agg(s.id order by k.ord)
    from unnest(c.sides) with ordinality as k (key, ord)
    join public.dishes s on s.household_id = p_household and s.catalog_key = k.key and s.id <> d.id
  ), '{}')
  from private.dish_catalog c
  where d.id = any (added) and d.catalog_key = c.key and cardinality(c.sides) > 0;

  return cardinality(added);
end
$$;

-- New households start with the catalogue items, then dishes. (Same as 0004,
-- plus the dishes line.)
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
  perform private.seed_household_dishes(hid);

  return hid;
end
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.dishes enable row level security;

revoke all on public.dishes from anon, authenticated;
grant select, insert, delete on public.dishes to authenticated;
-- Everything about a dish can be edited except where it lives.
grant update (
  name_ta, name_en, aliases, type, meals, is_veg, tags, ingredients, side_ids, prep_plan,
  is_favourite, is_kids_favourite, dont_suggest, notes
) on public.dishes to authenticated;

create policy "Members read their dishes"
  on public.dishes for select to authenticated
  using (public.is_member(household_id));

create policy "Members add dishes, as themselves"
  on public.dishes for insert to authenticated
  with check (public.is_member(household_id) and created_by = auth.uid());

create policy "Members edit their dishes"
  on public.dishes for update to authenticated
  using (public.is_member(household_id))
  with check (public.is_member(household_id));

create policy "Members delete their dishes"
  on public.dishes for delete to authenticated
  using (public.is_member(household_id));

-- ---------------------------------------------------------------------------
-- Backup: restore replaces dishes too. Same as 0004 plus the dishes lines.
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
  -- A backup made before Batch 3 has no dishes, and leaves them as they are.
  if p_tables ? 'dishes' then
    perform private.restore_replace('dishes', hid, p_tables -> 'dishes');
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Real-time: both phones see dish changes live (RLS applies; deletes carry only the id).
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.dishes;
