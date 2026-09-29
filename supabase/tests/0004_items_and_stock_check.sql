-- ============================================================================
-- Check for 0004_items_and_stock. Paste into the Supabase SQL editor and run
-- (after 0004 is applied). Throwaway users and a throwaway catalogue row, rolled
-- back at the end. Success shows one result row, "All items and stock checks
-- passed"; any failure stops with an error saying which.
-- ============================================================================

begin;

-- One catalogue row, so seeding can be checked whether or not 0005 is loaded yet.
insert into private.item_catalog (key, name_ta, name_en, aliases, category, unit, display_unit, shelf_life_days, step)
values ('check-okra', 'வெண்டைக்காய்', 'Ladies finger', array['vendakkai', 'okra'], 'vegetable', 'g', 'kg', 5, 250)
on conflict (key) do nothing;

do $$
declare
  a uuid := gen_random_uuid();
  c uuid := gen_random_uuid();
  hid uuid;
  other_hid uuid;
  item uuid;
  other_item uuid;
  ev uuid := gen_random_uuid();
  n int;
  ok boolean;
begin
  insert into auth.users (id, email, aud, role)
  values (a, 'stock-a@example.test', 'authenticated', 'authenticated'),
         (c, 'stock-c@example.test', 'authenticated', 'authenticated');

  -- ---- A new household starts with the catalogue ----------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  hid := public.create_household('Stock home');

  select id into item from public.items where household_id = hid and catalog_key = 'check-okra';
  if item is null then raise exception 'FAIL: new household was not seeded from the catalogue'; end if;
  select count(*) into n from public.items where household_id = hid;
  execute 'reset role';
  if n <> (select count(*) from private.item_catalog) then
    raise exception 'FAIL: seeded % items, catalogue has %', n, (select count(*) from private.item_catalog);
  end if;
  if private.seed_household_items(hid) <> 0 then raise exception 'FAIL: seeding twice added items'; end if;

  -- ---- A adds stock; the same event replayed is ignored ------------------------------
  execute 'set local role authenticated';
  insert into public.stock_events (id, household_id, item_id, kind, quantity, reason, created_by)
  values (ev, hid, item, 'delta', 500, 'bought', a);
  insert into public.stock_events (id, household_id, item_id, kind, quantity, reason, created_by)
  values (ev, hid, item, 'delta', 500, 'bought', a)
  on conflict (id) do nothing;
  select count(*) into n from public.stock_events where household_id = hid;
  if n <> 1 then raise exception 'FAIL: expected 1 event after a replay, got %', n; end if;

  -- Events can't be changed or deleted, even by the person who made them.
  ok := false;
  begin
    update public.stock_events set quantity = 5 where id = ev;
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL: a stock event was updated'; end if;
  ok := false;
  begin
    delete from public.stock_events where id = ev;
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL: a stock event was deleted'; end if;

  -- Can't write events as someone else.
  ok := false;
  begin
    insert into public.stock_events (id, household_id, item_id, kind, quantity, created_by)
    values (gen_random_uuid(), hid, item, 'delta', 1, c);
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL: an event was written in someone else''s name'; end if;

  -- Items can be edited (and it's recorded who), but not moved or re-united.
  update public.items set aliases = array_append(aliases, 'bhindi'), is_staple = true where id = item;
  select updated_by = a into ok from public.items where id = item;
  if not ok then raise exception 'FAIL: item edit not attributed'; end if;
  ok := false;
  begin
    update public.items set unit = 'piece' where id = item;
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL: an item''s stored unit was changed'; end if;

  -- A household's own new item.
  insert into public.items (household_id, name_ta, name_en, category, unit, display_unit, step, created_by)
  values (hid, 'மாங்காய் இஞ்சி', 'Mango ginger', 'spice', 'g', 'g', 50, a);

  -- ---- C, a stranger, sees and touches none of it --------------------------------------
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  other_hid := public.create_household('Stranger home');
  select id into other_item from public.items where household_id = other_hid and catalog_key = 'check-okra';

  select count(*) into n from public.items where household_id = hid;
  if n <> 0 then raise exception 'FAIL: C sees A''s items'; end if;
  select count(*) into n from public.stock_events where household_id = hid;
  if n <> 0 then raise exception 'FAIL: C sees A''s stock'; end if;
  update public.items set name_en = 'hacked' where id = item;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: C edited A''s item'; end if;

  ok := false;
  begin
    insert into public.stock_events (id, household_id, item_id, kind, quantity, created_by)
    values (gen_random_uuid(), hid, item, 'delta', 1, c);
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL: C added stock to A''s household'; end if;

  -- An event in C's household can't point at A's item.
  ok := false;
  begin
    insert into public.stock_events (id, household_id, item_id, kind, quantity, created_by)
    values (gen_random_uuid(), other_hid, item, 'delta', 1, c);
  exception when foreign_key_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL: an event linked to another household''s item'; end if;

  -- ---- Restore brings items and events back; an old backup leaves them alone ------------
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.restore_snapshot(jsonb_build_object(
    'profiles', '[]'::jsonb,
    'items', (select jsonb_agg(to_jsonb(i)) from public.items i where household_id = hid and catalog_key = 'check-okra'),
    'stock_events', jsonb_build_array(jsonb_build_object(
      'id', gen_random_uuid(), 'item_id', item, 'kind', 'delta', 'quantity', 750, 'reason', 'bought',
      'form', 'whole', 'occurred_at', now(), 'created_by', a, 'created_at', now()))
  ));
  select count(*) into n from public.items where household_id = hid;
  if n <> 1 then raise exception 'FAIL: restore should leave exactly the 1 backed-up item, got %', n; end if;
  select count(*) into n from public.stock_events where household_id = hid and quantity = 750;
  if n <> 1 then raise exception 'FAIL: restored stock event missing'; end if;
  select count(*) into n from public.items where household_id = hid and 'bhindi' = any (aliases);
  if n <> 1 then raise exception 'FAIL: item aliases not restored'; end if;

  perform public.restore_snapshot('{"profiles": []}'::jsonb);
  select count(*) into n from public.stock_events where household_id = hid;
  if n <> 1 then raise exception 'FAIL: a backup without items wiped the stock'; end if;
  execute 'reset role';
end
$$;

rollback;

-- Only reached when every check above passed (a failure aborts the script).
select 'All items and stock checks passed' as result;
