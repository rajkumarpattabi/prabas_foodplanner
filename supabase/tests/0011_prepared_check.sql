-- ============================================================================
-- Check for 0011_prepared. Paste into the Supabase SQL editor and run (after 0011 is
-- applied). Throwaway users, rolled back at the end. Success shows one result row,
-- "All batch checks passed"; any failure stops with an error saying which.
-- ============================================================================

begin;

do $$
declare
  a uuid := gen_random_uuid();
  c uuid := gen_random_uuid();
  hid uuid;
  other_hid uuid;
  batter uuid := gen_random_uuid();
  dosa uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  other_b uuid := gen_random_uuid();
  glass uuid := gen_random_uuid();
  rb uuid := gen_random_uuid();
  n int;
  ok boolean;
begin
  insert into auth.users (id, email, aud, role)
  values (a, 'batch-a@example.test', 'authenticated', 'authenticated'),
         (c, 'batch-c@example.test', 'authenticated', 'authenticated');

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  hid := public.create_household('Batch home');

  -- ---- Dishes: the prepared type, and what a dish uses --------------------------------------
  insert into public.dishes (id, household_id, name_ta, name_en, type, prep_plan, created_by)
  values (batter, hid, 'மாவு', 'Batter', 'prepared', '{"stages": [], "yield": 4, "unit": "meals"}', a);
  insert into public.dishes (id, household_id, name_ta, name_en, type, created_by)
  values (dosa, hid, 'தோசை', 'Dosa', 'tiffin', a);
  update public.dishes set uses_prepared = jsonb_build_array(jsonb_build_object('dish_id', batter, 'quantity', 1)) where id = dosa;
  select jsonb_array_length(uses_prepared) = 1 into ok from public.dishes where id = dosa;
  if not ok then raise exception 'FAIL: uses_prepared not saved'; end if;
  ok := false;
  begin
    update public.dishes set type = 'batter' where id = batter;
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL: an unknown dish type was accepted'; end if;
  ok := false;
  begin
    update public.dishes set prep_plan = '[1, 2]' where id = batter;
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL: a prep plan that is not an object was accepted'; end if;

  -- ---- A batch: started, then events; never changed ---------------------------------------
  insert into public.batches (id, household_id, dish_id, name_ta, name_en, stages, planned_start, yield, unit, keeps_days, created_by)
  values (b, hid, batter, 'மாவு', 'Batter', '[{"key": "soak", "hours": 5, "action": true}]', now(), 4, 'meals', 3, a);
  insert into public.batch_events (id, household_id, batch_id, kind, stage, created_by)
  values (gen_random_uuid(), hid, b, 'done', 0, a);
  insert into public.batch_events (id, household_id, batch_id, kind, quantity, created_by)
  values (glass, hid, b, 'used', 1, a), (gen_random_uuid(), hid, b, 'used', 1, a);
  insert into public.batch_events (id, household_id, batch_id, kind, undoes, created_by)
  values (gen_random_uuid(), hid, b, 'undo', glass, a);
  select count(*) into n from public.batch_events where batch_id = b;
  if n <> 4 then raise exception 'FAIL: expected 4 batch events, got %', n; end if;

  ok := false;
  begin
    insert into public.batch_events (id, household_id, batch_id, kind, quantity, created_by)
    values (gen_random_uuid(), hid, b, 'used', 0, a);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL: using nothing was accepted'; end if;
  ok := false;
  begin
    insert into public.batch_events (id, household_id, batch_id, kind, created_by)
    values (gen_random_uuid(), hid, b, 'done', a);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL: a stage done without its stage was accepted'; end if;
  ok := false;
  begin
    insert into public.batch_events (id, household_id, batch_id, kind, created_by)
    values (gen_random_uuid(), hid, b, 'undo', a);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL: an undo of nothing was accepted'; end if;

  ok := false;
  begin
    update public.batch_events set quantity = 5 where id = glass;
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL: a batch event was changed'; end if;
  ok := false;
  begin
    delete from public.batch_events where id = glass;
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL: a batch event was deleted'; end if;
  ok := false;
  begin
    update public.batches set yield = 10 where id = b;
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL: a batch was changed'; end if;
  ok := false;
  begin
    insert into public.batch_events (id, household_id, batch_id, kind, created_by)
    values (gen_random_uuid(), hid, b, 'discard', c);
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL: an event as someone else was accepted'; end if;

  -- A deleted dish leaves the batch, with its names.
  delete from public.dishes where id = batter;
  select dish_id is null and name_en = 'Batter' into ok from public.batches where id = b;
  if not ok then raise exception 'FAIL: deleting a dish broke its batch'; end if;

  -- ---- C, a stranger, sees and touches none of it ------------------------------------------
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  other_hid := public.create_household('Stranger home');
  select count(*) into n from public.batches where household_id = hid;
  if n <> 0 then raise exception 'FAIL: C sees A''s batches'; end if;
  select count(*) into n from public.batch_events where household_id = hid;
  if n <> 0 then raise exception 'FAIL: C sees A''s batch events'; end if;
  delete from public.batches where id = b;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: C deleted A''s batch'; end if;
  ok := false;
  begin
    insert into public.batch_events (id, household_id, batch_id, kind, created_by)
    values (gen_random_uuid(), hid, b, 'discard', c);
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL: C added an event to A''s batch'; end if;
  -- Nor can C hang an event in C's own household on A's batch.
  insert into public.batches (id, household_id, name_ta, name_en, stages, planned_start, yield, unit, keeps_days, created_by)
  values (other_b, other_hid, 'கூழ்', 'Koozh', '[{"key": "soak", "hours": 9, "action": true}]', now(), 10, 'glasses', 3, c);
  ok := false;
  begin
    insert into public.batch_events (id, household_id, batch_id, kind, created_by)
    values (gen_random_uuid(), other_hid, b, 'discard', c);
  exception when foreign_key_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL: an event pointed at another household''s batch'; end if;

  -- ---- Restore: batches and events come back; an older backup leaves them -----------------
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.restore_snapshot(jsonb_build_object(
    'profiles', '[]'::jsonb,
    'batches', jsonb_build_array(jsonb_build_object(
      'id', rb, 'dish_id', dosa, 'name_ta', 'கூழ்', 'name_en', 'Koozh',
      'stages', '[{"key": "soak", "hours": 9, "action": true}]'::jsonb, 'planned_start', now(),
      'yield', 10, 'unit', 'glasses', 'keeps_days', 3, 'created_by', a, 'created_at', now()),
      jsonb_build_object(
      'id', gen_random_uuid(), 'dish_id', gen_random_uuid(), 'name_ta', 'போனது', 'name_en', 'Gone',
      'stages', '[{"key": "cook", "hours": 1, "action": true}]'::jsonb, 'planned_start', now(),
      'yield', 6, 'unit', 'meals', 'keeps_days', 30, 'created_by', a, 'created_at', now())),
    'batch_events', jsonb_build_array(jsonb_build_object(
      'id', gen_random_uuid(), 'batch_id', rb, 'kind', 'used', 'quantity', 2,
      'occurred_at', now(), 'created_by', a, 'created_at', now()))
  ));
  select count(*) into n from public.batches where household_id = hid;
  if n <> 2 then raise exception 'FAIL: restore should leave exactly 2 batches, got %', n; end if;
  select count(*) into n from public.batches where id = b;
  if n <> 0 then raise exception 'FAIL: restore kept a batch that is not in the backup'; end if;
  select count(*) into n from public.batches where id = rb and dish_id = dosa;
  if n <> 1 then raise exception 'FAIL: restored batch lost its dish'; end if;
  select count(*) into n from public.batches where household_id = hid and name_en = 'Gone' and dish_id is null;
  if n <> 1 then raise exception 'FAIL: a batch pointing at a missing dish broke the restore'; end if;
  select count(*) into n from public.batch_events where household_id = hid;
  if n <> 1 then raise exception 'FAIL: restore should leave exactly 1 batch event, got %', n; end if;

  perform public.restore_snapshot('{"profiles": []}'::jsonb);
  select count(*) into n from public.batches where household_id = hid;
  if n <> 2 then raise exception 'FAIL: a backup without batches changed the batches'; end if;

  -- Removing a batch (undoing its start) takes its events with it.
  delete from public.batches where id = rb;
  select count(*) into n from public.batch_events where batch_id = rb;
  if n <> 0 then raise exception 'FAIL: a removed batch left its events'; end if;
  execute 'reset role';
end
$$;

select 'All batch checks passed' as result;

rollback;
