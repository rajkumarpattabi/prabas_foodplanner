-- ============================================================================
-- PRABAS Food Planner · 0011 prepared items and batches
--
-- dishes:       gain the 'prepared' type (batter, dough, paste: made ahead, never a
--               meal on its own) and uses_prepared: [{dish_id, quantity, optional?,
--               prefers_aged?}], "dosa uses 1 meal of batter". prep_plan holds the
--               stages, yield and batch ingredients (shape: src/prepared/types.ts).
-- batches:      one row per batch, as started: which item, its stages (with this
--               batch's ferment time), when it starts, yield and how long it keeps.
--               Never updated: everything after the start is a batch event.
-- batch_events: append-only, like stock_events. A stage done, a glass had, a
--               correction, thrown away, or an undo of one of those. Where a batch is,
--               and what's left, is replayed from these (src/prepared/batchState.ts),
--               so both phones can mark glasses at once without losing one.
--
-- The prepared catalogue (the starter items and which dishes use them) is 0012.
-- ============================================================================

alter table public.dishes drop constraint dishes_type_check;
alter table public.dishes add constraint dishes_type_check check (type in (
  'tiffin', 'variety_rice', 'kuzhambu', 'sambar', 'rasam', 'poriyal', 'kootu',
  'chutney', 'nonveg_gravy', 'nonveg_fry', 'drink', 'snack', 'prepared'));

alter table public.dishes
  add column uses_prepared jsonb not null default '[]'
    check (jsonb_typeof(uses_prepared) = 'array' and jsonb_array_length(uses_prepared) <= 10),
  add constraint dishes_prep_plan_check check (prep_plan is null or jsonb_typeof(prep_plan) = 'object');

grant update (uses_prepared) on public.dishes to authenticated;

create table public.batches (
  -- Made on the phone, so replaying the offline queue can never start a batch twice.
  id            uuid primary key,
  household_id  uuid not null references public.households (id) on delete cascade,
  -- Null if the dish has since been deleted; the names stay.
  dish_id       uuid references public.dishes (id) on delete set null,
  name_ta       text not null check (char_length(name_ta) between 1 and 80),
  name_en       text not null check (char_length(name_en) between 1 and 80),
  -- [{key, hours, action, takes_ingredients?, adjustable?}]
  stages        jsonb not null check (jsonb_typeof(stages) = 'array' and jsonb_array_length(stages) between 1 and 10),
  planned_start timestamptz not null,
  ready_by      timestamptz,
  yield         numeric not null check (yield > 0 and yield <= 1000),
  unit          text not null check (unit in ('meals', 'glasses')),
  keeps_days    numeric not null check (keeps_days >= 0 and keeps_days <= 365),
  created_by    uuid references auth.users (id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  -- Lets batch_events require that its batch is in the same household.
  unique (id, household_id)
);

create index batches_household on public.batches (household_id, created_at);

create table public.batch_events (
  id           uuid primary key,
  household_id uuid not null,
  batch_id     uuid not null,
  kind         text not null check (kind in ('done', 'end', 'extend', 'shift', 'used', 'set', 'discard', 'undo')),
  -- The stage it's about (done, end, extend, shift), counting from 0.
  stage        int check (stage between 0 and 9),
  -- Meals or glasses (used, set); hours (extend).
  quantity     numeric,
  -- For kind 'undo': the event it cancels.
  undoes       uuid,
  -- When it happened on the phone; offline changes keep their real time.
  occurred_at  timestamptz not null default now(),
  created_by   uuid references auth.users (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  foreign key (batch_id, household_id) references public.batches (id, household_id) on delete cascade,
  check ((kind in ('done', 'end', 'extend', 'shift')) = (stage is not null)),
  check ((kind in ('used', 'set', 'extend')) = (quantity is not null)),
  check (kind <> 'used' or quantity > 0),
  check (kind <> 'set' or quantity >= 0),
  check (kind <> 'extend' or (quantity <> 0 and abs(quantity) <= 72)),
  check ((kind = 'undo') = (undoes is not null))
);

create index batch_events_household on public.batch_events (household_id, occurred_at);
create index batch_events_batch on public.batch_events (batch_id, occurred_at);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.batches      enable row level security;
alter table public.batch_events enable row level security;

revoke all on public.batches, public.batch_events from anon, authenticated;
grant select, insert on public.batches, public.batch_events to authenticated;
-- A batch can be removed (undoing its start, which takes its events with it), never
-- changed. No update or delete on batch_events at all: events are append-only.
grant delete on public.batches to authenticated;

create policy "Members read their batches"
  on public.batches for select to authenticated
  using (public.is_member(household_id));
create policy "Members start batches, as themselves"
  on public.batches for insert to authenticated
  with check (public.is_member(household_id) and created_by = auth.uid());
create policy "Members remove their batches"
  on public.batches for delete to authenticated
  using (public.is_member(household_id));

create policy "Members read their batch events"
  on public.batch_events for select to authenticated
  using (public.is_member(household_id));
create policy "Members add batch events, as themselves"
  on public.batch_events for insert to authenticated
  with check (public.is_member(household_id) and created_by = auth.uid());

-- ---------------------------------------------------------------------------
-- Backup: restore replaces batches and their events too. Same as 0009 plus their lines.
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
  -- A backup made before Batch 6 has no batches, and leaves them as they are. Batches
  -- before their events (replacing them clears the old events); a batch keeps its link
  -- only to a dish that's here after the restore.
  if p_tables ? 'batches' then
    perform private.restore_replace('batches', hid, (
      select coalesce(jsonb_agg(b || jsonb_build_object(
        'dish_id', (select d.id from public.dishes d where d.household_id = hid and d.id::text = b ->> 'dish_id')
      )), '[]'::jsonb)
      from jsonb_array_elements(p_tables -> 'batches') b
    ));
    perform private.restore_replace('batch_events', hid, p_tables -> 'batch_events');
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Real-time: both phones see batches move along, and glasses counted, live.
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.batches, public.batch_events;
