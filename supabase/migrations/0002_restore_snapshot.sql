-- ============================================================================
-- PRABAS Food Planner · 0002 restore from backup
--
-- restore_snapshot(tables) replaces the caller's household data from a backup,
-- all at once: if any part fails, nothing changes. Only the backup owner may
-- call it. The app validates and migrates the backup file before sending
-- `tables` (the snapshot's "tables" object).
--
-- Each later batch that adds a backed-up table re-creates this function with one
-- more `perform private.restore_replace('<table>', hid, p_tables -> '<table>')` line.
-- ============================================================================

-- Replace every row of one household-scoped table with the backup's rows.
-- household_id is forced to the caller's household, so a backup can't write
-- into anyone else's, and a backup from an old project restores into the new one.
create function private.restore_replace(p_table text, p_household uuid, p_rows jsonb) returns void
language plpgsql
set search_path = ''
as $$
begin
  execute format('delete from public.%I where household_id = $1', p_table) using p_household;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    return;
  end if;
  execute format(
    'insert into public.%I select * from jsonb_populate_recordset(null::public.%I, $1)',
    p_table, p_table
  ) using (
    select jsonb_agg(r || jsonb_build_object('household_id', p_household))
    from jsonb_array_elements(p_rows) r
  );
end
$$;

create function public.restore_snapshot(p_tables jsonb) returns void
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

  -- Profiles belong to people, not the household, so they are merged: current
  -- members get their saved name and preferences back. Nobody is added or removed.
  update public.profiles p
  set display_name = coalesce(b.display_name, p.display_name),
      script_pref  = coalesce(b.script_pref, p.script_pref),
      theme_pref   = coalesce(b.theme_pref, p.theme_pref)
  from jsonb_populate_recordset(null::public.profiles, coalesce(p_tables -> 'profiles', '[]'::jsonb)) b
  where p.user_id = b.user_id
    and exists (select 1 from public.household_members m where m.household_id = hid and m.user_id = p.user_id);

  -- Household tables (Batch 2 on), one line each:
  -- perform private.restore_replace('items', hid, p_tables -> 'items');
end
$$;

revoke execute on function public.restore_snapshot(jsonb) from public, anon;
grant execute on function public.restore_snapshot(jsonb) to authenticated;
