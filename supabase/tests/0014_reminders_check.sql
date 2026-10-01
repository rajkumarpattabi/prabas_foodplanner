-- ============================================================================
-- Check for 0014_reminders. Paste into the Supabase SQL editor and run (after 0014 is
-- applied). Throwaway users, rolled back at the end. Success shows one result row,
-- "All reminder checks passed"; any failure stops with an error saying which.
-- ============================================================================

begin;

do $$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  c uuid := gen_random_uuid();
  hid uuid;
  other_hid uuid;
  code text;
  sid uuid;
  rid text;
  n int;
  ok boolean;
begin
  insert into auth.users (id, email, aud, role)
  values (a, 'rem-a@example.test', 'authenticated', 'authenticated'),
         (b, 'rem-b@example.test', 'authenticated', 'authenticated'),
         (c, 'rem-c@example.test', 'authenticated', 'authenticated');

  -- A makes the household; B joins it; C has their own.
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  hid := public.create_household('Reminder home');
  select join_code into code from public.households where id = hid;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.join_household(code);

  -- ---- Devices: registered through register_push, each sees only their own ---------------
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  sid := public.register_push('https://push.example.test/abc', 'p256dh-key-aaaa', 'auth-key-aaaa', 'iPhone');
  select count(*) into n from public.push_subscriptions;
  if n <> 1 then raise exception 'FAIL: A should see 1 device, got %', n; end if;
  -- Registering again (a new key) updates the same row.
  perform public.register_push('https://push.example.test/abc', 'p256dh-key-bbbb', 'auth-key-bbbb', 'iPhone');
  select count(*) into n from public.push_subscriptions where p256dh = 'p256dh-key-bbbb';
  if n <> 1 then raise exception 'FAIL: re-registering did not update the device'; end if;
  ok := false;
  begin
    insert into public.push_subscriptions (household_id, user_id, endpoint, p256dh, auth) values (hid, a, 'https://x.example.test/1', 'p256dh-key-cccc', 'auth-key-cccc');
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL: a device was added without register_push'; end if;

  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.push_subscriptions;
  if n <> 0 then raise exception 'FAIL: B sees A''s device'; end if;
  delete from public.push_subscriptions where id = sid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: B removed A''s device'; end if;
  -- The phone changes hands: signed in as B now, it's B's.
  perform public.register_push('https://push.example.test/abc', 'p256dh-key-dddd', 'auth-key-dddd', 'Android phone');
  select count(*) into n from public.push_subscriptions;
  if n <> 1 then raise exception 'FAIL: the device did not move to B'; end if;

  -- ---- Settings: each person their own ----------------------------------------------------
  insert into public.reminder_settings (user_id, household_id, created_by) values (b, hid, b);
  update public.reminder_settings set evening_time = '21:00', types = array['stage'] where user_id = b;
  select evening_time = '21:00' and quiet_from = '22:00' into ok from public.reminder_settings where user_id = b;
  if not ok then raise exception 'FAIL: settings not saved, or defaults missing'; end if;
  ok := false;
  begin
    insert into public.reminder_settings (user_id, household_id, created_by) values (a, hid, b);
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL: B saved settings for A'; end if;
  ok := false;
  begin
    update public.reminder_settings set types = array['birthday'] where user_id = b;
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL: an unknown reminder type was accepted'; end if;

  -- ---- Reminders: household-wide, one row per key ----------------------------------------
  rid := hid::text || ':stage:b1:0';
  insert into public.reminders (id, household_id, type, title, due_at, expires_at, created_by)
  values (rid, hid, 'stage', 'Ragi koozh: soak now', now(), now() + interval '3 hours', b);
  insert into public.reminders (id, household_id, type, title, due_at, expires_at, created_by)
  values (rid, hid, 'stage', 'Ragi koozh: soak now', now(), now() + interval '3 hours', b)
  on conflict (id) do nothing;
  update public.reminders set title = 'Ragi koozh: soak now (shifted)' where id = rid;
  ok := false;
  begin
    insert into public.reminders (id, household_id, type, title, at_evening, expires_at, created_by)
    values (hid::text || ':low:x', hid, 'low', 'Running low', true, now(), b);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL: an evening reminder with no day was accepted'; end if;
  ok := false;
  begin
    insert into public.reminders (id, household_id, type, title, due_at, expires_at, created_by)
    values ('elsewhere:low:x', hid, 'low', 'Running low', now(), now(), b);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL: a reminder id for another household was accepted'; end if;

  -- ---- Deliveries: only the server writes them ----------------------------------------------
  ok := false;
  begin
    insert into public.reminder_deliveries (reminder_id, user_id) values (rid, b);
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL: a phone recorded a delivery'; end if;
  execute 'reset role';
  insert into public.reminder_deliveries (reminder_id, user_id) values (rid, a), (rid, b);
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.reminder_deliveries;
  if n <> 1 then raise exception 'FAIL: B should see only their own delivery, got %', n; end if;

  -- ---- C, a stranger, sees and touches none of it ------------------------------------------
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  other_hid := public.create_household('Stranger home');
  select count(*) into n from public.reminders where household_id = hid;
  if n <> 0 then raise exception 'FAIL: C sees A''s reminders'; end if;
  select count(*) into n from public.reminder_settings;
  if n <> 0 then raise exception 'FAIL: C sees others'' settings'; end if;
  delete from public.reminders where id = rid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: C removed A''s reminder'; end if;

  -- ---- Restore (A owns the backups): settings come back, for members only -----------------
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.restore_snapshot(jsonb_build_object(
    'profiles', '[]'::jsonb,
    'reminder_settings', jsonb_build_array(
      jsonb_build_object('user_id', b, 'evening_time', '19:45', 'types', array['prep'], 'quiet_from', '22:00', 'quiet_to', '06:30',
        'timezone', 'Asia/Kolkata', 'created_by', b, 'created_at', now(), 'updated_at', now()),
      jsonb_build_object('user_id', c, 'evening_time', '18:00', 'types', array['prep'], 'quiet_from', '22:00', 'quiet_to', '06:30',
        'timezone', 'Asia/Kolkata', 'created_by', c, 'created_at', now(), 'updated_at', now()))
  ));
  execute 'reset role';
  select count(*) into n from public.reminder_settings where household_id = hid;
  if n <> 1 then raise exception 'FAIL: restore should leave 1 setting row, got %', n; end if;
  select count(*) into n from public.reminder_settings where user_id = b and evening_time = '19:45';
  if n <> 1 then raise exception 'FAIL: B''s settings were not restored'; end if;
  -- Removing a reminder takes its deliveries with it.
  delete from public.reminders where id = rid;
  select count(*) into n from public.reminder_deliveries where reminder_id = rid;
  if n <> 0 then raise exception 'FAIL: a removed reminder left its deliveries'; end if;
end
$$;

select 'All reminder checks passed' as result;

rollback;
