-- ============================================================================
-- PRABAS Food Planner · 0013 shopping list
--
-- Most of the shopping list is worked out on the phone (running low, what planned
-- meals and batches need, what a likely meal would need: src/shop/build.ts). Only
-- what people do to it is stored here:
--   want: added by hand; done_at once bought (ticking off also adds it to stock).
--   skip: a worked-out line hidden until skip_until, unless a more urgent reason
--         than `section` comes up.
-- ============================================================================

create table public.shopping_items (
  -- Made on the phone, so replaying the offline queue can never add one twice.
  id           uuid primary key,
  household_id uuid not null,
  item_id      uuid not null,
  kind         text not null check (kind in ('want', 'skip')),
  -- For want: how much, in the item's stored unit, if said.
  quantity     numeric check (quantity is null or quantity > 0),
  -- For skip: hidden until the end of this day, and from which section.
  skip_until   date,
  section      text check (section in ('low', 'planned', 'maybe', 'added')),
  done_at      timestamptz,
  done_by      uuid references auth.users (id) on delete set null,
  created_by   uuid references auth.users (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_by   uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at   timestamptz not null default now(),
  -- The item is in the same household; deleting it takes its lines with it.
  foreign key (item_id, household_id) references public.items (id, household_id) on delete cascade,
  check (kind <> 'skip' or (skip_until is not null and done_at is null)),
  check (done_at is null or done_by is not null)
);

-- One open "want" per item: adding it again on the other phone at the same time is one line.
create unique index shopping_items_one_open_want on public.shopping_items (household_id, item_id)
  where kind = 'want' and done_at is null;
create index shopping_items_household on public.shopping_items (household_id);

create trigger stamp_update before update on public.shopping_items
  for each row execute function private.stamp_update();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.shopping_items enable row level security;

revoke all on public.shopping_items from anon, authenticated;
grant select, insert, delete on public.shopping_items to authenticated;
-- What it is and which item are fixed; how much, until when, and bought can change.
grant update (quantity, skip_until, section, done_at, done_by) on public.shopping_items to authenticated;

create policy "Members read their shopping list"
  on public.shopping_items for select to authenticated
  using (public.is_member(household_id));
create policy "Members add to their shopping list, as themselves"
  on public.shopping_items for insert to authenticated
  with check (public.is_member(household_id) and created_by = auth.uid());
create policy "Members change their shopping list"
  on public.shopping_items for update to authenticated
  using (public.is_member(household_id))
  with check (public.is_member(household_id));
create policy "Members remove from their shopping list"
  on public.shopping_items for delete to authenticated
  using (public.is_member(household_id));

-- ---------------------------------------------------------------------------
-- Backup: restore replaces the shopping list too. Same as 0011 plus its lines.
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

  -- Items first (replacing them also clears their events and shopping lines), then the events.
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
  -- A backup made before Batch 7 has no shopping list, and leaves it as it is. Only
  -- lines for items that are here after the restore come back.
  if p_tables ? 'shopping_items' then
    perform private.restore_replace('shopping_items', hid, (
      select coalesce(jsonb_agg(s), '[]'::jsonb)
      from jsonb_array_elements(p_tables -> 'shopping_items') s
      where exists (select 1 from public.items i where i.household_id = hid and i.id::text = s ->> 'item_id')
    ));
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Real-time: both phones see the list change live.
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.shopping_items;
