-- ============================================================================
-- Check for 0009_calendar. Paste into the Supabase SQL editor and run (after 0009 is
-- applied). Throwaway users and catalogue rows, rolled back at the end. Success shows
-- one result row, "All calendar checks passed"; any failure stops with an error.
-- ============================================================================

begin;

insert into private.calendar_catalog (date, end_date, type, label, note)
values ('2030-01-03', null, 'amavasai', '', 'check source'),
       ('2030-09-18', '2030-10-17', 'puratasi', '', 'check source')
on conflict do nothing;

do $$
declare
  a uuid := gen_random_uuid();
  c uuid := gen_random_uuid();
  hid uuid;
  other_hid uuid;
  ama uuid;
  n int;
  ok boolean;
begin
  insert into auth.users (id, email, aud, role)
  values (a, 'cal-a@example.test', 'authenticated', 'authenticated'),
         (c, 'cal-c@example.test', 'authenticated', 'authenticated');

  -- ---- A new household starts with the catalogue dates, unverified --------------------
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  hid := public.create_household('Calendar home');
  select id into ama from public.calendar_days where household_id = hid and date = '2030-01-03' and type = 'amavasai';
  if ama is null then raise exception 'FAIL: new household was not given the catalogue dates'; end if;
  select verified into ok from public.calendar_days where id = ama;
  if ok then raise exception 'FAIL: a seeded date came in verified'; end if;
  select end_date = '2030-10-17' into ok from public.calendar_days where household_id = hid and type = 'puratasi' and date = '2030-09-18';
  if not ok then raise exception 'FAIL: Puratasi lost its end date'; end if;

  -- ---- Confirm, edit, add a family day; seeding again leaves them alone ----------------
  update public.calendar_days set verified = true, label = 'Thai Amavasai' where id = ama;
  select updated_by = a and verified into ok from public.calendar_days where id = ama;
  if not ok then raise exception 'FAIL: confirming was not saved or not attributed'; end if;
  insert into public.calendar_days (household_id, date, type, label, verified, created_by)
  values (hid, '2030-02-14', 'family_custom', 'Thatha''s day', true, a);
  execute 'reset role';
  if private.seed_household_calendar(hid) <> 0 then raise exception 'FAIL: seeding twice added dates'; end if;
  select verified and label = 'Thai Amavasai' into ok from public.calendar_days where id = ama;
  if not ok then raise exception 'FAIL: seeding again undid a confirmation'; end if;
  execute 'set local role authenticated';

  -- Only Puratasi has an end date, and it can't end before it starts.
  ok := false;
  begin
    insert into public.calendar_days (household_id, date, end_date, type, created_by) values (hid, '2030-03-01', '2030-03-02', 'amavasai', a);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL: a single day took an end date'; end if;
  ok := false;
  begin
    update public.calendar_days set end_date = '2030-09-01' where household_id = hid and type = 'puratasi';
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL: Puratasi ended before it began'; end if;
  ok := false;
  begin
    update public.calendar_days set household_id = gen_random_uuid() where id = ama;
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL: a calendar day moved household'; end if;

  -- ---- C, a stranger, sees and touches none of it ---------------------------------------
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  other_hid := public.create_household('Stranger home');
  select count(*) into n from public.calendar_days where household_id = hid;
  if n <> 0 then raise exception 'FAIL: C sees A''s calendar'; end if;
  update public.calendar_days set verified = false where id = ama;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: C changed A''s calendar'; end if;
  delete from public.calendar_days where id = ama;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: C deleted A''s calendar day'; end if;
  ok := false;
  begin
    insert into public.calendar_days (household_id, date, type, created_by) values (hid, '2030-05-05', 'family_custom', c);
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL: C added a day to A''s calendar'; end if;

  -- ---- Restore brings the calendar back; an older backup leaves it ----------------------
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.restore_snapshot(jsonb_build_object(
    'profiles', '[]'::jsonb,
    'calendar_days', (select jsonb_agg(to_jsonb(d)) from public.calendar_days d where id = ama)
  ));
  select count(*) into n from public.calendar_days where household_id = hid;
  if n <> 1 then raise exception 'FAIL: restore should leave exactly the 1 backed-up day, got %', n; end if;
  perform public.restore_snapshot('{"profiles": []}'::jsonb);
  select count(*) into n from public.calendar_days where household_id = hid;
  if n <> 1 then raise exception 'FAIL: a backup without a calendar changed it'; end if;
  execute 'reset role';
end
$$;

select 'All calendar checks passed' as result;

rollback;
