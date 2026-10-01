-- ============================================================================
-- PRABAS Food Planner · 0009 calendar of restricted days
--
-- calendar_days: days with no non-veg (meat, fish or egg), per household:
--   Amavasai, Kiruthigai, family days (one day each), and Puratasi (a stretch, with
--   an end_date). Saturdays are a rule in the app, not rows here.
--   Dates are seeded from published Tamil calendars, unverified, for someone at home
--   to check against their panchangam (`verified`). Unverified days still restrict.
--
-- The starter dates are loaded by 0010_calendar_dates.sql.
-- ============================================================================

create table public.calendar_days (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  date         date not null,
  -- The last day of a stretch (Puratasi); null for a single day.
  end_date     date,
  type         text not null check (type in ('amavasai', 'kiruthigai', 'puratasi', 'family_custom')),
  label        text not null default '' check (char_length(label) <= 80),
  verified     boolean not null default false,
  -- Where it came from, and whether the sources agreed.
  note         text check (char_length(note) <= 300),
  created_by   uuid references auth.users (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_by   uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at   timestamptz not null default now(),
  unique (household_id, date, type),
  check (end_date is null or (type = 'puratasi' and end_date >= date))
);

create index calendar_days_household on public.calendar_days (household_id, date);

create trigger stamp_update before update on public.calendar_days
  for each row execute function private.stamp_update();

-- ---------------------------------------------------------------------------
-- Catalogue: the starter dates every household gets a copy of (loaded by 0010).
-- ---------------------------------------------------------------------------

create table private.calendar_catalog (
  date     date not null,
  end_date date,
  type     text not null,
  label    text not null default '',
  note     text,
  primary key (date, type)
);

-- Copies catalogue dates into a household, unverified. Safe to run again: dates the
-- household already has (or has since confirmed or edited) are left alone.
create function private.seed_household_calendar(p_household uuid) returns int
language plpgsql
set search_path = ''
as $$
declare
  n int;
begin
  insert into public.calendar_days (household_id, date, end_date, type, label, verified, note, created_by, updated_by)
  select p_household, c.date, c.end_date, c.type, c.label, false, c.note, null, null
  from private.calendar_catalog c
  on conflict (household_id, date, type) do nothing;
  get diagnostics n = row_count;
  return n;
end
$$;

-- New households start with the catalogue items, dishes, then calendar. (Same as 0006,
-- plus the calendar line.)
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
  perform private.seed_household_calendar(hid);

  return hid;
end
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.calendar_days enable row level security;

revoke all on public.calendar_days from anon, authenticated;
grant select, insert, delete on public.calendar_days to authenticated;
grant update (date, end_date, label, verified, note) on public.calendar_days to authenticated;

create policy "Members read their calendar"
  on public.calendar_days for select to authenticated
  using (public.is_member(household_id));
create policy "Members add calendar days, as themselves"
  on public.calendar_days for insert to authenticated
  with check (public.is_member(household_id) and created_by = auth.uid());
create policy "Members change their calendar"
  on public.calendar_days for update to authenticated
  using (public.is_member(household_id))
  with check (public.is_member(household_id));
create policy "Members remove calendar days"
  on public.calendar_days for delete to authenticated
  using (public.is_member(household_id));

-- ---------------------------------------------------------------------------
-- Backup: restore replaces the calendar too. Same as 0008 plus the calendar lines.
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
  -- A backup made before Batch 5 has no calendar, and leaves it as it is.
  if p_tables ? 'calendar_days' then
    perform private.restore_replace('calendar_days', hid, p_tables -> 'calendar_days');
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Real-time: both phones see calendar changes live.
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.calendar_days;
