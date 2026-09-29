-- ============================================================================
-- PRABAS Food Planner · 0001 foundation
-- Households, membership, and profiles, with Row Level Security on every table.
--
-- Households are created and joined only through the functions below
-- (create_household, join_household), never by direct inserts.
-- Internal helpers live in the `private` schema, which the API does not expose.
-- ============================================================================

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.households (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (char_length(btrim(name)) between 1 and 60),
  -- Shown in Settings so the second person can join. 6 characters, no look-alikes.
  join_code       text not null unique check (join_code ~ '^[2-9A-HJ-NP-Z]{6}$'),
  -- The one member who connects Google Drive backup (normally the creator).
  backup_owner_id uuid references auth.users (id) on delete set null,
  created_by      uuid references auth.users (id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_by      uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at      timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  role         text not null default 'member' check (role in ('owner', 'member')),
  created_by   uuid references auth.users (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  primary key (household_id, user_id),
  -- One household per person.
  unique (user_id)
);

-- One row per person. Scoped through household_members rather than its own
-- household_id, so membership is recorded in exactly one place.
create table public.profiles (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 40),
  script_pref  text not null default 'ta_first' check (script_pref in ('ta_first', 'en_first')),
  theme_pref   text not null default 'auto' check (theme_pref in ('auto', 'light', 'dark')),
  created_by   uuid references auth.users (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_by   uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Attribution: every update records who and when; creation stamps never change.
-- ---------------------------------------------------------------------------

create function private.stamp_update() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  new.updated_at := now();
  return new;
end
$$;

create trigger stamp_update before update on public.households
  for each row execute function private.stamp_update();
create trigger stamp_update before update on public.profiles
  for each row execute function private.stamp_update();

-- ---------------------------------------------------------------------------
-- Membership helpers, used by the RLS policies. SECURITY DEFINER so a policy on
-- household_members can check membership without recursing into itself.
-- ---------------------------------------------------------------------------

create function public.is_member(hid uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = hid and m.user_id = auth.uid()
  )
$$;

create function public.shares_household(other uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members me
    join public.household_members them on them.household_id = me.household_id
    where me.user_id = auth.uid() and them.user_id = other
  )
$$;

-- ---------------------------------------------------------------------------
-- Join codes: 6 characters from 32 symbols without 0/O or 1/I, from
-- cryptographically random bytes (gen_random_uuid). 256 / 32 = 8, so no bias.
-- ---------------------------------------------------------------------------

create function private.new_join_code() returns text
language plpgsql volatile
set search_path = ''
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  bytes bytea;
  code text;
begin
  loop
    bytes := uuid_send(gen_random_uuid());
    code := '';
    for i in 0..5 loop
      code := code || substr(alphabet, 1 + (get_byte(bytes, i) % 32), 1);
    end loop;
    exit when not exists (select 1 from public.households where join_code = code);
  end loop;
  return code;
end
$$;

-- Accept what people actually type: lower case, spaces, or a dash ("k7m-4qp").
create function private.normalise_join_code(raw text) returns text
language sql immutable
set search_path = ''
as $$
  select upper(regexp_replace(coalesce(raw, ''), '[^A-Za-z0-9]', '', 'g'))
$$;

-- ---------------------------------------------------------------------------
-- Household functions (the only way to create or join a household)
-- ---------------------------------------------------------------------------

create function public.create_household(p_name text) returns uuid
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

  return hid;
end
$$;

create function public.join_household(p_code text) returns uuid
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

  select id into hid from public.households
  where join_code = private.normalise_join_code(p_code);
  if hid is null then
    raise exception 'Join code not found' using errcode = 'P0002';
  end if;

  insert into public.household_members (household_id, user_id, role, created_by)
  values (hid, uid, 'member', uid);

  return hid;
end
$$;

-- Any member can issue a new code, for example after sharing it by mistake.
create function public.rotate_join_code() returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  hid uuid;
  code text;
begin
  select household_id into hid from public.household_members where user_id = auth.uid();
  if hid is null then
    raise exception 'Not in a household' using errcode = 'P0002';
  end if;

  code := private.new_join_code();
  update public.households set join_code = code where id = hid;
  return code;
end
$$;

-- Only signed-in users may call these. (Supabase grants EXECUTE to anon by default.)
revoke execute on function
  public.is_member(uuid), public.shares_household(uuid),
  public.create_household(text), public.join_household(text), public.rotate_join_code()
  from public, anon;
grant execute on function
  public.is_member(uuid), public.shares_household(uuid),
  public.create_household(text), public.join_household(text), public.rotate_join_code()
  to authenticated;

-- ---------------------------------------------------------------------------
-- New sign-ups get a profile, named from the email address until they change it.
-- ---------------------------------------------------------------------------

create function private.handle_new_user() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name, created_by, updated_by)
  values (new.id, left(coalesce(split_part(new.email, '@', 1), ''), 40), new.id, new.id)
  on conflict (user_id) do nothing;
  return new;
end
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.households        enable row level security;
alter table public.household_members enable row level security;
alter table public.profiles          enable row level security;

-- Nothing for anonymous visitors. Signed-in users get only what is granted below,
-- and RLS narrows that to their own household.
revoke all on public.households, public.household_members, public.profiles from anon, authenticated;
grant select on public.households, public.household_members, public.profiles to authenticated;
grant update (name, backup_owner_id) on public.households to authenticated;
grant update (display_name, script_pref, theme_pref) on public.profiles to authenticated;

create policy "Members read their household"
  on public.households for select to authenticated
  using (public.is_member(id));

-- Members can rename the household or hand backup to another member.
create policy "Members update their household"
  on public.households for update to authenticated
  using (public.is_member(id))
  with check (
    public.is_member(id)
    and (
      backup_owner_id is null
      or exists (
        select 1 from public.household_members m
        where m.household_id = households.id and m.user_id = households.backup_owner_id
      )
    )
  );

create policy "Members read their household's members"
  on public.household_members for select to authenticated
  using (public.is_member(household_id));

create policy "Read own and co-members' profiles"
  on public.profiles for select to authenticated
  using (user_id = auth.uid() or public.shares_household(user_id));

create policy "Update own profile"
  on public.profiles for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Real-time: both phones see household and profile changes live (RLS applies).
-- ---------------------------------------------------------------------------

alter publication supabase_realtime
  add table public.households, public.household_members, public.profiles;
