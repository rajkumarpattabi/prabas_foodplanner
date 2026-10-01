-- ============================================================================
-- Check for 0008_meals. Paste into the Supabase SQL editor and run (after 0008 is
-- applied). Throwaway users, rolled back at the end. Success shows one result row,
-- "All meal checks passed"; any failure stops with an error saying which.
-- ============================================================================

begin;

do $$
declare
  a uuid := gen_random_uuid();
  c uuid := gen_random_uuid();
  hid uuid;
  other_hid uuid;
  pongal uuid := gen_random_uuid();
  sambar uuid := gen_random_uuid();
  mid text;
  lo uuid := gen_random_uuid();
  n int;
  ok boolean;
begin
  insert into auth.users (id, email, aud, role)
  values (a, 'meal-a@example.test', 'authenticated', 'authenticated'),
         (c, 'meal-c@example.test', 'authenticated', 'authenticated');

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  hid := public.create_household('Meal home');
  insert into public.dishes (id, household_id, name_ta, name_en, type, meals, created_by)
  values (pongal, hid, 'பொங்கல்', 'Pongal', 'tiffin', array['breakfast'], a),
         (sambar, hid, 'சாம்பார்', 'Sambar', 'sambar', array['breakfast'], a);
  mid := hid::text || ':2026-10-02:breakfast';

  -- ---- Plan: one row per household, date and meal; a second plan at once is ignored ----
  insert into public.meals (id, household_id, date, meal, dish_ids, dish_names, created_by)
  values (mid, hid, '2026-10-02', 'breakfast', array[pongal, sambar], '[{"dish_id": "x", "name_en": "Pongal"}]', a);
  insert into public.meals (id, household_id, date, meal, dish_ids, created_by)
  values (mid, hid, '2026-10-02', 'breakfast', array[sambar], a)
  on conflict (id) do nothing;
  select count(*) into n from public.meals where household_id = hid;
  if n <> 1 then raise exception 'FAIL: expected 1 planned meal, got %', n; end if;
  select dish_ids[1] = pongal into ok from public.meals where id = mid;
  if not ok then raise exception 'FAIL: the first plan did not win'; end if;

  -- The id must match the household, date and meal.
  ok := false;
  begin
    insert into public.meals (id, household_id, date, meal, dish_ids, created_by)
    values (hid::text || ':2026-10-03:lunch', hid, '2026-10-03', 'dinner', array[pongal], a);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL: a meal id that does not match was accepted'; end if;

  -- ---- Cook: needs a time; attributed; date and household can't change ------------------
  ok := false;
  begin
    update public.meals set status = 'cooked' where id = mid;
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL: cooked without a time'; end if;
  update public.meals set status = 'cooked', cooked_by = a, cooked_at = now() where id = mid;
  select updated_by = a and status = 'cooked' into ok from public.meals where id = mid;
  if not ok then raise exception 'FAIL: cooking not saved or not attributed'; end if;
  ok := false;
  begin
    update public.meals set date = '2026-10-05' where id = mid;
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL: a meal''s date was changed'; end if;

  -- ---- Leftovers: added, eaten; a deleted dish leaves the leftover and the history ----------
  insert into public.leftovers (id, household_id, dish_id, name_ta, name_en, meal_id, servings, expires_on, created_by)
  values (lo, hid, sambar, 'சாம்பார்', 'Sambar', mid, 2, '2026-10-03', a);
  update public.leftovers set eaten_at = now(), eaten_by = a where id = lo;
  delete from public.dishes where id = sambar;
  select dish_id is null and name_en = 'Sambar' into ok from public.leftovers where id = lo;
  if not ok then raise exception 'FAIL: deleting a dish broke its leftover'; end if;
  select sambar = any (dish_ids) into ok from public.meals where id = mid;
  if not ok then raise exception 'FAIL: deleting a dish changed meal history'; end if;

  -- ---- C, a stranger, sees and touches none of it ------------------------------------------
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  other_hid := public.create_household('Stranger home');
  select count(*) into n from public.meals where household_id = hid;
  if n <> 0 then raise exception 'FAIL: C sees A''s meals'; end if;
  select count(*) into n from public.leftovers where household_id = hid;
  if n <> 0 then raise exception 'FAIL: C sees A''s leftovers'; end if;
  update public.meals set status = 'planned' where id = mid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: C changed A''s meal'; end if;
  delete from public.leftovers where id = lo;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: C deleted A''s leftover'; end if;
  ok := false;
  begin
    insert into public.meals (id, household_id, date, meal, dish_ids, created_by)
    values (hid::text || ':2026-10-04:lunch', hid, '2026-10-04', 'lunch', array[pongal], c);
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL: C planned a meal in A''s household'; end if;

  -- ---- Restore: meals and leftovers come back, re-keyed; an older backup leaves them --------
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.restore_snapshot(jsonb_build_object(
    'profiles', '[]'::jsonb,
    'meals', jsonb_build_array(jsonb_build_object(
      'id', 'some-other-household:2026-09-01:lunch', 'date', '2026-09-01', 'meal', 'lunch',
      'dish_ids', jsonb_build_array(pongal), 'dish_names', '[]'::jsonb, 'status', 'cooked',
      'cooked_by', a, 'cooked_at', now(), 'created_by', a, 'created_at', now(), 'updated_at', now())),
    'leftovers', jsonb_build_array(jsonb_build_object(
      'id', gen_random_uuid(), 'dish_id', pongal, 'name_ta', 'பொங்கல்', 'name_en', 'Pongal',
      'meal_id', 'some-other-household:2026-09-01:lunch', 'servings', 1, 'expires_on', '2026-09-02',
      'created_by', a, 'created_at', now(), 'updated_at', now()),
      jsonb_build_object(
      'id', gen_random_uuid(), 'dish_id', gen_random_uuid(), 'name_ta', 'போனது', 'name_en', 'Gone',
      'meal_id', 'x:2025-01-01:dinner', 'servings', 1, 'expires_on', '2025-01-02',
      'created_by', a, 'created_at', now(), 'updated_at', now()))
  ));
  select count(*) into n from public.meals where household_id = hid;
  if n <> 1 then raise exception 'FAIL: restore should leave exactly 1 meal, got %', n; end if;
  select count(*) into n from public.meals where id = hid::text || ':2026-09-01:lunch';
  if n <> 1 then raise exception 'FAIL: restored meal not re-keyed to this household'; end if;
  select count(*) into n from public.leftovers where household_id = hid and meal_id = hid::text || ':2026-09-01:lunch' and dish_id = pongal;
  if n <> 1 then raise exception 'FAIL: restored leftover lost its meal or dish'; end if;
  select count(*) into n from public.leftovers where household_id = hid and name_en = 'Gone' and meal_id is null and dish_id is null;
  if n <> 1 then raise exception 'FAIL: a leftover pointing at a missing meal or dish broke the restore'; end if;

  perform public.restore_snapshot('{"profiles": []}'::jsonb);
  select count(*) into n from public.meals where household_id = hid;
  if n <> 1 then raise exception 'FAIL: a backup without meals changed the meals'; end if;
  execute 'reset role';
end
$$;

select 'All meal checks passed' as result;

rollback;
