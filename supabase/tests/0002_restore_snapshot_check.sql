-- ============================================================================
-- Check for 0002_restore_snapshot. Paste into the Supabase SQL editor and run
-- (after 0002 is applied). Uses throwaway users and a throwaway table inside a
-- transaction that is rolled back. Success shows one result row,
-- "All restore checks passed"; any failure stops with an error saying which.
-- ============================================================================

begin;

-- A stand-in household table, to test the generic replace used from Batch 2 on.
create table public.restore_check_rows (
  id uuid primary key,
  household_id uuid not null references public.households (id) on delete cascade,
  label text not null
);

do $$
declare
  a uuid := gen_random_uuid();   -- backup owner
  b uuid := gen_random_uuid();   -- member
  c uuid := gen_random_uuid();   -- stranger
  hid uuid;
  other_hid uuid;
  code text;
  n int;
  ok boolean;
begin
  insert into auth.users (id, email, aud, role)
  values (a, 'restore-a@example.test', 'authenticated', 'authenticated'),
         (b, 'restore-b@example.test', 'authenticated', 'authenticated'),
         (c, 'restore-c@example.test', 'authenticated', 'authenticated');

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  hid := public.create_household('Restore home');
  select join_code into code from public.households where id = hid;

  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.join_household(code);

  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  other_hid := public.create_household('Stranger home');

  -- ---- A member who isn't the backup owner can't restore ----------------------
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  ok := false;
  begin
    perform public.restore_snapshot('{"profiles": []}'::jsonb);
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL: a non-owner member restored'; end if;

  -- ---- The owner restores: profiles merge for members only ----------------------
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.restore_snapshot(jsonb_build_object('profiles', jsonb_build_array(
    jsonb_build_object('user_id', a, 'display_name', 'Raj', 'script_pref', 'en_first', 'theme_pref', 'dark'),
    jsonb_build_object('user_id', b, 'display_name', 'Amma'),
    jsonb_build_object('user_id', c, 'display_name', 'hacked')
  )));

  execute 'reset role';
  select count(*) into n from public.profiles
  where user_id = a and display_name = 'Raj' and script_pref = 'en_first' and theme_pref = 'dark';
  if n <> 1 then raise exception 'FAIL: owner profile not restored'; end if;
  select count(*) into n from public.profiles where user_id = b and display_name = 'Amma' and script_pref = 'ta_first';
  if n <> 1 then raise exception 'FAIL: member profile not merged (or missing fields not kept)'; end if;
  select count(*) into n from public.profiles where user_id = c and display_name = 'hacked';
  if n <> 0 then raise exception 'FAIL: restore changed a stranger''s profile'; end if;

  -- ---- Generic replace: own rows replaced, household forced, others untouched ----
  insert into public.restore_check_rows values
    (gen_random_uuid(), hid, 'old mine'),
    (gen_random_uuid(), other_hid, 'theirs');

  perform private.restore_replace('restore_check_rows', hid, jsonb_build_array(
    jsonb_build_object('id', gen_random_uuid(), 'household_id', other_hid, 'label', 'new 1'),
    jsonb_build_object('id', gen_random_uuid(), 'label', 'new 2')
  ));

  select count(*) into n from public.restore_check_rows where household_id = hid;
  if n <> 2 then raise exception 'FAIL: expected 2 restored rows, got %', n; end if;
  select count(*) into n from public.restore_check_rows where label = 'old mine';
  if n <> 0 then raise exception 'FAIL: old rows not removed'; end if;
  select count(*) into n from public.restore_check_rows where household_id = other_hid;
  if n <> 1 then raise exception 'FAIL: restore touched another household''s rows'; end if;

  perform private.restore_replace('restore_check_rows', hid, '[]'::jsonb);
  select count(*) into n from public.restore_check_rows where household_id = hid;
  if n <> 0 then raise exception 'FAIL: an empty backup table did not empty the table'; end if;

  -- ---- The helper isn't callable from the app ------------------------------------
  execute 'set local role authenticated';
  ok := false;
  begin
    perform private.restore_replace('restore_check_rows', hid, '[]'::jsonb);
  exception when insufficient_privilege or invalid_schema_name or undefined_function then ok := true;
  end;
  if not ok then raise exception 'FAIL: the app can call private.restore_replace'; end if;
  execute 'reset role';
end
$$;

rollback;

-- Only reached when every check above passed (a failure aborts the script).
select 'All restore checks passed' as result;
