-- ============================================================================
-- PRABAS Food Planner · 0016 bills
--
-- Bills are read on the phone (OCR, or text pasted from Google Lens or Live Text),
-- matched to items, reviewed, then added to stock in one go. Photos never leave the phone.
--   bills:        one per bill added: the shop, the day, the total, how many lines.
--   bill_aliases: a bill's word for an item, mapped by hand once and matched by itself
--                 next time. vendor is the normalised shop name, or '' for any shop.
--   stock_events: gain price (rupees for the line) and bill_id (the bill it came from).
-- ============================================================================

create table public.bills (
  -- Made on the phone, so replaying the offline queue can never add one twice.
  id           uuid primary key,
  household_id uuid not null references public.households (id) on delete cascade,
  vendor       text not null default '' check (char_length(vendor) <= 80),
  bill_date    date not null default current_date,
  total        numeric check (total is null or (total >= 0 and total <= 1000000)),
  lines        int not null default 0 check (lines between 0 and 200),
  created_by   uuid references auth.users (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now()
);

create index bills_household on public.bills (household_id, bill_date);

create table public.bill_aliases (
  id           uuid primary key,
  household_id uuid not null,
  -- The normalised shop name, or '' for any shop.
  vendor       text not null default '' check (char_length(vendor) <= 80),
  -- The normalised bill text.
  raw          text not null check (char_length(raw) between 1 and 80),
  item_id      uuid not null,
  created_by   uuid references auth.users (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_by   uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at   timestamptz not null default now(),
  -- The item is in the same household; deleting it takes its bill names with it.
  foreign key (item_id, household_id) references public.items (id, household_id) on delete cascade,
  unique (household_id, vendor, raw)
);

create trigger stamp_update before update on public.bill_aliases
  for each row execute function private.stamp_update();

alter table public.stock_events
  add column price   numeric check (price is null or (price >= 0 and price <= 1000000)),
  -- The bill it came from (not a foreign key: like batch_id, it survives the bill going).
  add column bill_id uuid;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.bills        enable row level security;
alter table public.bill_aliases enable row level security;

revoke all on public.bills, public.bill_aliases from anon, authenticated;
-- A bill is added, or removed (undo); never changed.
grant select, insert, delete on public.bills to authenticated;
grant select, insert, delete on public.bill_aliases to authenticated;
-- A bill name can be pointed at a different item; its shop and words are fixed.
grant update (item_id) on public.bill_aliases to authenticated;

create policy "Members read their bills"
  on public.bills for select to authenticated
  using (public.is_member(household_id));
create policy "Members add bills, as themselves"
  on public.bills for insert to authenticated
  with check (public.is_member(household_id) and created_by = auth.uid());
create policy "Members remove their bills"
  on public.bills for delete to authenticated
  using (public.is_member(household_id));

create policy "Members read their bill names"
  on public.bill_aliases for select to authenticated
  using (public.is_member(household_id));
create policy "Members add bill names, as themselves"
  on public.bill_aliases for insert to authenticated
  with check (public.is_member(household_id) and created_by = auth.uid());
create policy "Members change their bill names"
  on public.bill_aliases for update to authenticated
  using (public.is_member(household_id))
  with check (public.is_member(household_id));
create policy "Members remove their bill names"
  on public.bill_aliases for delete to authenticated
  using (public.is_member(household_id));

-- ---------------------------------------------------------------------------
-- Backup: restore brings back bills and bill names too. Same as 0014 plus their lines
-- (stock events' new columns come back with them on their own).
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
  -- A backup made before Batch 10 has no bills, and leaves bills and bill names as they
  -- are. A bill name comes back only for an item that's here after the restore.
  if p_tables ? 'bills' then
    perform private.restore_replace('bills', hid, p_tables -> 'bills');
    perform private.restore_replace('bill_aliases', hid, (
      select coalesce(jsonb_agg(a), '[]'::jsonb)
      from jsonb_array_elements(coalesce(p_tables -> 'bill_aliases', '[]'::jsonb)) a
      where exists (select 1 from public.items i where i.household_id = hid and i.id::text = a ->> 'item_id')
    ));
  end if;
  -- A backup made before Batch 8 has no reminder settings, and leaves them as they are.
  -- Only settings of people who are in the household now come back.
  if p_tables ? 'reminder_settings' then
    perform private.restore_replace('reminder_settings', hid, (
      select coalesce(jsonb_agg(r), '[]'::jsonb)
      from jsonb_array_elements(p_tables -> 'reminder_settings') r
      where exists (select 1 from public.household_members m where m.household_id = hid and m.user_id::text = r ->> 'user_id')
    ));
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Real-time: both phones see a bill added, and the names it taught.
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.bills, public.bill_aliases;
