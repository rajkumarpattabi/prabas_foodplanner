-- ============================================================================
-- Check for 0006_dishes. Paste into the Supabase SQL editor and run (after 0006
-- is applied). Throwaway users and throwaway catalogue rows, rolled back at the
-- end. Success shows one result row, "All dish checks passed"; any failure stops
-- with an error saying which.
-- ============================================================================

begin;

-- Throwaway catalogue rows, so seeding can be checked whether or not 0007 is loaded.
insert into private.item_catalog (key, name_ta, name_en, category, unit, display_unit, step)
values ('check-rice', 'அரிசி', 'Rice', 'grain', 'g', 'kg', 1000),
       ('check-egg', 'முட்டை', 'Egg', 'egg', 'piece', 'piece', 1)
on conflict (key) do nothing;
insert into private.dish_catalog (key, name_ta, name_en, type, meals, tags, ingredients, sides)
values
  ('check-pongal', 'பொங்கல்', 'Pongal', 'tiffin', array['breakfast'], array[]::text[],
   '[{"item": "check-rice", "quantity": 500}]', array['check-sambar', 'check-chutney']),
  ('check-sambar', 'சாம்பார்', 'Sambar', 'sambar', array['breakfast', 'lunch'], array['legume'], '[]', '{}'),
  ('check-chutney', 'சட்னி', 'Chutney', 'chutney', array['breakfast'], '{}', '[]', '{}'),
  ('check-egg-rice', 'முட்டை சாதம்', 'Egg rice', 'variety_rice', array['lunch'], array['protein'],
   '[{"item": "check-rice", "quantity": 500}, {"item": "check-egg", "quantity": 4, "optional": true}]', '{}')
on conflict (key) do nothing;

do $$
declare
  a uuid := gen_random_uuid();
  c uuid := gen_random_uuid();
  hid uuid;
  other_hid uuid;
  pongal uuid;
  sambar uuid;
  chutney uuid;
  rice uuid;
  n int;
  ok boolean;
  sides uuid[];
begin
  insert into auth.users (id, email, aud, role)
  values (a, 'dish-a@example.test', 'authenticated', 'authenticated'),
         (c, 'dish-c@example.test', 'authenticated', 'authenticated');

  -- ---- A new household starts with the dish catalogue --------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  hid := public.create_household('Dish home');

  select id into pongal from public.dishes where household_id = hid and catalog_key = 'check-pongal';
  select id into sambar from public.dishes where household_id = hid and catalog_key = 'check-sambar';
  select id into chutney from public.dishes where household_id = hid and catalog_key = 'check-chutney';
  select id into rice from public.items where household_id = hid and catalog_key = 'check-rice';
  if pongal is null or sambar is null then raise exception 'FAIL: new household was not seeded with dishes'; end if;

  -- Ingredients point at the household's own items; sides at its own dishes, in rank order.
  select (ingredients -> 0 ->> 'item_id')::uuid = rice and (ingredients -> 0 ->> 'quantity')::numeric = 500
    into ok from public.dishes where id = pongal;
  if not ok then raise exception 'FAIL: pongal ingredients not mapped to the household''s rice'; end if;
  select side_ids into sides from public.dishes where id = pongal;
  if sides is distinct from array[sambar, chutney] then raise exception 'FAIL: pongal sides wrong: %', sides; end if;

  -- Egg makes a dish non-veg, even as an optional topping.
  select is_veg into ok from public.dishes where household_id = hid and catalog_key = 'check-egg-rice';
  if ok then raise exception 'FAIL: egg rice was seeded as veg'; end if;
  select is_veg into ok from public.dishes where id = pongal;
  if not ok then raise exception 'FAIL: pongal was seeded as non-veg'; end if;
  select (ingredients -> 1 ->> 'optional')::boolean into ok
  from public.dishes where household_id = hid and catalog_key = 'check-egg-rice';
  if not ok then raise exception 'FAIL: optional ingredient flag lost'; end if;

  -- ---- A edits; sides removed on purpose stay removed after seeding again -------------
  update public.dishes set is_favourite = true, side_ids = array[chutney] where id = pongal;
  select updated_by = a and is_favourite into ok from public.dishes where id = pongal;
  if not ok then raise exception 'FAIL: dish edit not saved or not attributed'; end if;
  execute 'reset role';
  if private.seed_household_dishes(hid) <> 0 then raise exception 'FAIL: seeding twice added dishes'; end if;
  select side_ids into sides from public.dishes where id = pongal;
  if sides is distinct from array[chutney] then raise exception 'FAIL: seeding again changed edited sides'; end if;
  execute 'set local role authenticated';

  -- A dish can't be its own side, or move to another household.
  ok := false;
  begin
    update public.dishes set side_ids = array[pongal] where id = pongal;
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL: a dish became its own side'; end if;
  ok := false;
  begin
    update public.dishes set household_id = gen_random_uuid() where id = pongal;
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL: a dish was moved to another household'; end if;

  -- The household's own new dish, then deleting a side takes it out of pairings.
  insert into public.dishes (household_id, name_ta, name_en, type, meals, created_by)
  values (hid, 'கொள்ளு ரசம்', 'Kollu rasam', 'rasam', array['lunch'], a);
  delete from public.dishes where id = chutney;
  select side_ids into sides from public.dishes where id = pongal;
  if sides <> '{}' then raise exception 'FAIL: deleted dish still listed as a side: %', sides; end if;

  -- ---- C, a stranger, sees and touches none of it --------------------------------------
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  other_hid := public.create_household('Stranger home');
  select count(*) into n from public.dishes where household_id = hid;
  if n <> 0 then raise exception 'FAIL: C sees A''s dishes'; end if;
  update public.dishes set name_en = 'hacked' where id = pongal;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: C edited A''s dish'; end if;
  delete from public.dishes where id = sambar;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: C deleted A''s dish'; end if;
  ok := false;
  begin
    insert into public.dishes (household_id, name_ta, name_en, type, created_by) values (hid, 'x', 'x', 'snack', c);
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL: C added a dish to A''s household'; end if;

  -- ---- Restore brings dishes back; an older backup leaves them alone -------------------
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.restore_snapshot(jsonb_build_object(
    'profiles', '[]'::jsonb,
    'dishes', (select jsonb_agg(to_jsonb(d)) from public.dishes d where id in (pongal, sambar))
  ));
  select count(*) into n from public.dishes where household_id = hid;
  if n <> 2 then raise exception 'FAIL: restore should leave exactly the 2 backed-up dishes, got %', n; end if;
  select is_favourite and ingredients -> 0 ->> 'item_id' = rice::text into ok from public.dishes where id = pongal;
  if not ok then raise exception 'FAIL: restored dish lost its flags or ingredients'; end if;

  perform public.restore_snapshot('{"profiles": []}'::jsonb);
  select count(*) into n from public.dishes where household_id = hid;
  if n <> 2 then raise exception 'FAIL: a backup without dishes changed the dishes'; end if;
  execute 'reset role';
end
$$;

select 'All dish checks passed' as result;

rollback;
