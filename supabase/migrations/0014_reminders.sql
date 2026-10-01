-- ============================================================================
-- PRABAS Food Planner · 0014 reminders
--
-- push_subscriptions:  one per phone or browser that can be sent reminders. Added
--                      through register_push (so a phone that changes hands moves
--                      to its new owner); each person sees and removes only theirs.
-- reminder_settings:   one per person: which kinds, the evening time, quiet hours.
-- reminders:           what's coming up for the household, written by the phones
--                      (src/reminders/schedule.ts). The id is '<household>:<key>',
--                      so both phones writing the same reminder land on one row.
-- reminder_deliveries: who has been sent what, so nobody gets one twice. Written
--                      only by the send-reminders function (service role).
-- ============================================================================

create table public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  endpoint     text not null unique check (char_length(endpoint) between 10 and 1000),
  p256dh       text not null check (char_length(p256dh) between 10 and 200),
  auth         text not null check (char_length(auth) between 10 and 100),
  -- "iPhone", "Android phone": shown in Settings.
  label        text not null default '' check (char_length(label) <= 60),
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);

create index push_subscriptions_user on public.push_subscriptions (user_id);

-- This phone, for whoever is signed in on it now, in their household.
create function public.register_push(p_endpoint text, p_p256dh text, p_auth text, p_label text) returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  hid uuid;
  sid uuid;
begin
  select household_id into hid from public.household_members where user_id = uid;
  if hid is null then
    raise exception 'Not in a household' using errcode = '42501';
  end if;
  insert into public.push_subscriptions (household_id, user_id, endpoint, p256dh, auth, label)
  values (hid, uid, p_endpoint, p_p256dh, p_auth, coalesce(p_label, ''))
  on conflict (endpoint) do update set
    household_id = excluded.household_id, user_id = excluded.user_id,
    p256dh = excluded.p256dh, auth = excluded.auth, label = excluded.label
  returning id into sid;
  return sid;
end
$$;

revoke execute on function public.register_push(text, text, text, text) from public, anon;
grant execute on function public.register_push(text, text, text, text) to authenticated;

create table public.reminder_settings (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  types        text[] not null default array['prep', 'stage', 'nonveg', 'low', 'expiry']
                 check (types <@ array['prep', 'stage', 'nonveg', 'low', 'expiry']::text[]),
  evening_time time not null default '20:30',
  quiet_from   time not null default '22:00',
  quiet_to     time not null default '06:30',
  timezone     text not null default 'Asia/Kolkata' check (char_length(timezone) between 3 and 60),
  created_by   uuid references auth.users (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_by   uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at   timestamptz not null default now()
);

create trigger stamp_update before update on public.reminder_settings
  for each row execute function private.stamp_update();

create table public.reminders (
  id           text primary key,
  household_id uuid not null references public.households (id) on delete cascade,
  type         text not null check (type in ('prep', 'stage', 'nonveg', 'low', 'expiry')),
  title        text not null check (char_length(title) between 1 and 120),
  body         text not null default '' check (char_length(body) <= 300),
  url          text not null default '/plan' check (url in ('/plan', '/shop', '/stock')),
  -- An exact time (a batch step), or a day sent at each person's evening time.
  due_at       timestamptz,
  due_date     date,
  at_evening   boolean not null default false,
  expires_at   timestamptz not null,
  created_by   uuid references auth.users (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_by   uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at   timestamptz not null default now(),
  check (starts_with(id, household_id::text || ':')),
  check ((at_evening and due_date is not null) or (not at_evening and due_at is not null))
);

create index reminders_household on public.reminders (household_id);
create index reminders_expires on public.reminders (expires_at);

create trigger stamp_update before update on public.reminders
  for each row execute function private.stamp_update();

create table public.reminder_deliveries (
  reminder_id text not null references public.reminders (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  sent_at     timestamptz not null default now(),
  primary key (reminder_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.push_subscriptions  enable row level security;
alter table public.reminder_settings   enable row level security;
alter table public.reminders           enable row level security;
alter table public.reminder_deliveries enable row level security;

revoke all on public.push_subscriptions, public.reminder_settings, public.reminders, public.reminder_deliveries from anon, authenticated;

-- Subscriptions are added through register_push; people see and remove their own.
grant select, delete on public.push_subscriptions to authenticated;
create policy "People see their own devices"
  on public.push_subscriptions for select to authenticated
  using (user_id = auth.uid());
create policy "People remove their own devices"
  on public.push_subscriptions for delete to authenticated
  using (user_id = auth.uid());

grant select, insert on public.reminder_settings to authenticated;
grant update (types, evening_time, quiet_from, quiet_to, timezone) on public.reminder_settings to authenticated;
create policy "People read their own reminder settings"
  on public.reminder_settings for select to authenticated
  using (user_id = auth.uid());
create policy "People save their own reminder settings, in their household"
  on public.reminder_settings for insert to authenticated
  with check (user_id = auth.uid() and created_by = auth.uid() and public.is_member(household_id));
create policy "People change their own reminder settings"
  on public.reminder_settings for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_member(household_id));

grant select, insert, delete on public.reminders to authenticated;
grant update (type, title, body, url, due_at, due_date, at_evening, expires_at) on public.reminders to authenticated;
create policy "Members read their reminders"
  on public.reminders for select to authenticated
  using (public.is_member(household_id));
create policy "Members add reminders, as themselves"
  on public.reminders for insert to authenticated
  with check (public.is_member(household_id) and created_by = auth.uid());
create policy "Members change their reminders"
  on public.reminders for update to authenticated
  using (public.is_member(household_id))
  with check (public.is_member(household_id));
create policy "Members remove their reminders"
  on public.reminders for delete to authenticated
  using (public.is_member(household_id));

-- Deliveries: people can see what they've been sent; only the server writes them.
grant select on public.reminder_deliveries to authenticated;
create policy "People see what they were sent"
  on public.reminder_deliveries for select to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Backup: restore brings back reminder settings (for people still in the household).
-- Devices, reminders and deliveries aren't backed up: they belong to a phone, or are
-- worked out again. Same as 0013 plus the settings lines.
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
-- Real-time: both phones see the reminders each writes, so they agree on them.
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.reminders;
