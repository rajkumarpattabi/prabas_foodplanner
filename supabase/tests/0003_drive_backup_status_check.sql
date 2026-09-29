-- ============================================================================
-- Check for 0003_drive_backup_status. Paste into the Supabase SQL editor and run
-- (after 0003 is applied). Rolled back at the end. Success shows one result row,
-- "All Drive status checks passed"; any failure stops with an error saying which.
-- ============================================================================

begin;

do $$
declare
  a uuid := gen_random_uuid();
  c uuid := gen_random_uuid();
  hid uuid;
  n int;
  ok boolean;
begin
  insert into auth.users (id, email, aud, role)
  values (a, 'drive-a@example.test', 'authenticated', 'authenticated'),
         (c, 'drive-c@example.test', 'authenticated', 'authenticated');

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  hid := public.create_household('Drive home');

  update public.households set drive_backup_at = now() where id = hid;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: a member could not record the Drive backup time'; end if;
  select drive_backup_at is not null into ok from public.households where id = hid;
  if not ok then raise exception 'FAIL: Drive backup time not saved'; end if;

  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  update public.households set drive_backup_at = null where id = hid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: a stranger changed another household''s Drive backup time'; end if;
  execute 'reset role';
end
$$;

rollback;

-- Only reached when every check above passed (a failure aborts the script).
select 'All Drive status checks passed' as result;
