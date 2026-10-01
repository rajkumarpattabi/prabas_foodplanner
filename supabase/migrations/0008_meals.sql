-- ============================================================================
-- PRABAS Food Planner · 0008 meals and leftovers
--
-- meals:     one per household, date and meal (breakfast, lunch, dinner): planned,
--            then cooked. The id is '<household>:<date>:<meal>', so both phones
--            planning the same meal land on the same row. Cooked meals are the
--            meal history; dish names are kept, so history outlives a deleted dish.
-- leftovers: servings of a cooked dish, eaten or not.
-- ============================================================================

create table public.meals (
  id           text primary key,
  household_id uuid not null references public.households (id) on delete cascade,
  date         date not null,
  meal         text not null check (meal in ('breakfast', 'lunch', 'dinner')),
  -- The main dish first, then its sides. Not foreign keys: a deleted dish stays in history.
  dish_ids     uuid[] not null check (cardinality(dish_ids) between 1 and 6),
  -- [{dish_id, name_ta, name_en, type}], as they were.
  dish_names   jsonb not null default '[]' check (jsonb_typeof(dish_names) = 'array'),
  status       text not null default 'planned' check (status in ('planned', 'cooked')),
  cooked_by    uuid references auth.users (id) on delete set null,
  cooked_at    timestamptz,
  -- created_by is who planned it (or cooked it, if it wasn't planned first).
  created_by   uuid references auth.users (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_by   uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at   timestamptz not null default now(),
  check (id = household_id::text || ':' || date::text || ':' || meal),
  check (status = 'planned' or cooked_at is not null)
);

create index meals_household on public.meals (household_id, date);

create trigger stamp_update before update on public.meals
  for each row execute function private.stamp_update();

create table public.leftovers (
  id           uuid primary key,
  household_id uuid not null references public.households (id) on delete cascade,
  dish_id      uuid references public.dishes (id) on delete set null,
  name_ta      text not null check (char_length(name_ta) between 1 and 80),
  name_en      text not null check (char_length(name_en) between 1 and 80),
  meal_id      text references public.meals (id) on delete set null,
  servings     int not null check (servings between 1 and 50),
  -- Good until the end of this day.
  expires_on   date not null,
  eaten_at     timestamptz,
  eaten_by     uuid references auth.users (id) on delete set null,
  created_by   uuid references auth.users (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_by   uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at   timestamptz not null default now()
);

create index leftovers_household on public.leftovers (household_id);

create trigger stamp_update before update on public.leftovers
  for each row execute function private.stamp_update();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.meals     enable row level security;
alter table public.leftovers enable row level security;

revoke all on public.meals, public.leftovers from anon, authenticated;
grant select, insert, delete on public.meals, public.leftovers to authenticated;
-- A meal's date, meal and household are its identity; everything else can change.
grant update (dish_ids, dish_names, status, cooked_by, cooked_at) on public.meals to authenticated;
grant update (servings, expires_on, eaten_at, eaten_by) on public.leftovers to authenticated;

create policy "Members read their meals"
  on public.meals for select to authenticated
  using (public.is_member(household_id));
create policy "Members plan meals, as themselves"
  on public.meals for insert to authenticated
  with check (public.is_member(household_id) and created_by = auth.uid());
create policy "Members change their meals"
  on public.meals for update to authenticated
  using (public.is_member(household_id))
  with check (public.is_member(household_id));
create policy "Members remove their meals"
  on public.meals for delete to authenticated
  using (public.is_member(household_id));

create policy "Members read their leftovers"
  on public.leftovers for select to authenticated
  using (public.is_member(household_id));
create policy "Members add leftovers, as themselves"
  on public.leftovers for insert to authenticated
  with check (public.is_member(household_id) and created_by = auth.uid());
create policy "Members change their leftovers"
  on public.leftovers for update to authenticated
  using (public.is_member(household_id))
  with check (public.is_member(household_id));
create policy "Members remove their leftovers"
  on public.leftovers for delete to authenticated
  using (public.is_member(household_id));

-- ---------------------------------------------------------------------------
-- Backup: restore replaces meals and leftovers too. Same as 0006 plus their lines.
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
  -- A backup made before Batch 4 has no meals, and leaves meals and leftovers as they are.
  -- Meals before leftovers, which can point at them. A meal's id carries its household,
  -- so a backup from another household's project is re-keyed to this one.
  if p_tables ? 'meals' then
    perform private.restore_replace('meals', hid, (
      select coalesce(jsonb_agg(m || jsonb_build_object('id', hid::text || ':' || (m ->> 'date') || ':' || (m ->> 'meal'))), '[]'::jsonb)
      from jsonb_array_elements(p_tables -> 'meals') m
    ));
    -- A leftover keeps its links only to a meal and dish that are here after the restore.
    perform private.restore_replace('leftovers', hid, (
      select coalesce(jsonb_agg(l || jsonb_build_object(
        'meal_id', (select m.id from public.meals m
                    where m.household_id = hid
                      and m.id = hid::text || ':' || split_part(l ->> 'meal_id', ':', 2) || ':' || split_part(l ->> 'meal_id', ':', 3)),
        'dish_id', (select d.id from public.dishes d where d.household_id = hid and d.id::text = l ->> 'dish_id')
      )), '[]'::jsonb)
      from jsonb_array_elements(coalesce(p_tables -> 'leftovers', '[]'::jsonb)) l
    ));
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Real-time: both phones see plans, cooking and leftovers live.
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.meals, public.leftovers;
