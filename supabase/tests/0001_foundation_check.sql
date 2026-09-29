-- ============================================================================
-- RLS check for 0001_foundation. Paste into the Supabase SQL editor and run.
--
-- It creates three throwaway users inside a transaction, acts as each of them,
-- and ROLLS BACK at the end, so nothing is left behind. Success prints
-- "All foundation checks passed"; any failure stops with an error saying which.
--
--   A  creates a household          B  joins it with the code
--   C  is a stranger with their own household, and must see none of A's data
-- ============================================================================

begin;

do $$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  c uuid := gen_random_uuid();
  hid uuid;
  code text;
  new_code text;
  n int;
  ok boolean;
begin
  insert into auth.users (id, email, aud, role)
  values (a, 'check-a@example.test', 'authenticated', 'authenticated'),
         (b, 'check-b@example.test', 'authenticated', 'authenticated'),
         (c, 'check-c@example.test', 'authenticated', 'authenticated');

  select count(*) into n from public.profiles where user_id in (a, b, c);
  if n <> 3 then raise exception 'FAIL: sign-up trigger did not create 3 profiles (got %)', n; end if;

  -- ---- A creates a household ------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  hid := public.create_household('Check home');
  select join_code into code from public.households where id = hid;
  if code is null then raise exception 'FAIL: A cannot read own household'; end if;

  ok := false;
  begin
    perform public.create_household('Second home');
  exception when sqlstate 'P0001' then ok := true;
  end;
  if not ok then raise exception 'FAIL: A created a second household'; end if;

  -- ---- B, before joining, sees nothing; then joins with a messy code -----------
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select count(*) into n from public.households;
  if n <> 0 then raise exception 'FAIL: B sees % households before joining', n; end if;

  if public.join_household(lower(substr(code, 1, 3)) || ' - ' || lower(substr(code, 4))) <> hid then
    raise exception 'FAIL: B joined the wrong household';
  end if;

  select count(*) into n from public.household_members where household_id = hid;
  if n <> 2 then raise exception 'FAIL: B sees % members, expected 2', n; end if;

  select count(*) into n from public.profiles where user_id in (a, b);
  if n <> 2 then raise exception 'FAIL: B sees % of the 2 household profiles', n; end if;

  -- B edits own profile; attribution is recorded.
  update public.profiles set display_name = 'B' where user_id = b;
  select updated_by = b into ok from public.profiles where user_id = b;
  if not ok then raise exception 'FAIL: updated_by not recorded'; end if;

  -- B cannot edit A's profile (RLS hides the row, so 0 rows change).
  update public.profiles set display_name = 'hacked' where user_id = a;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: B edited A''s profile'; end if;

  -- B can rename the household, but cannot set the join code directly.
  update public.households set name = 'Check home 2' where id = hid;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: B could not rename the household'; end if;
  ok := false;
  begin
    update public.households set join_code = 'ZZZZZZ' where id = hid;
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL: B set the join code directly'; end if;

  -- The backup owner must be a member.
  ok := false;
  begin
    update public.households set backup_owner_id = c where id = hid;
  exception when insufficient_privilege or check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL: backup owner set to a non-member'; end if;

  new_code := public.rotate_join_code();
  if new_code = code then raise exception 'FAIL: join code did not change'; end if;

  -- ---- C, a stranger, sees none of it -----------------------------------------
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  ok := false;
  begin
    perform public.join_household(code);  -- the old, rotated code
  exception when sqlstate 'P0002' then ok := true;
  end;
  if not ok then raise exception 'FAIL: C joined with a rotated code'; end if;

  perform public.create_household('Stranger home');

  select count(*) into n from public.households where id = hid;
  if n <> 0 then raise exception 'FAIL: C sees A''s household'; end if;
  select count(*) into n from public.household_members where household_id = hid;
  if n <> 0 then raise exception 'FAIL: C sees A''s members'; end if;
  select count(*) into n from public.profiles where user_id in (a, b);
  if n <> 0 then raise exception 'FAIL: C sees A''s or B''s profile'; end if;

  update public.households set name = 'taken' where id = hid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: C renamed A''s household'; end if;

  -- ---- Anonymous visitors get nothing ------------------------------------------
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
  ok := false;
  begin
    select count(*) into n from public.households;
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL: anon can read households'; end if;
  ok := false;
  begin
    perform public.create_household('Anon home');
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL: anon can call create_household'; end if;
  execute 'reset role';

  raise notice 'All foundation checks passed';
end
$$;

rollback;
