-- ============================================================================
-- Check for 0016_bills. Paste into the Supabase SQL editor and run (after 0016 is
-- applied). Throwaway users, rolled back at the end. Success shows one result row,
-- "All bill checks passed"; any failure stops with an error saying which.
-- ============================================================================

begin;

do $$
declare
  a uuid := gen_random_uuid();
  c uuid := gen_random_uuid();
  hid uuid;
  other_hid uuid;
  tomato uuid;
  other_item uuid;
  bill uuid := gen_random_uuid();
  alias uuid := gen_random_uuid();
  n int;
  ok boolean;
begin
  insert into auth.users (id, email, aud, role)
  values (a, 'bill-a@example.test', 'authenticated', 'authenticated'),
         (c, 'bill-c@example.test', 'authenticated', 'authenticated');

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  hid := public.create_household('Bill home');
  select id into tomato from public.items where household_id = hid order by name_en limit 1;

  -- ---- A bill, its stock with prices, and a name it taught ---------------------------------
  insert into public.bills (id, household_id, vendor, total, lines, created_by) values (bill, hid, 'Murugan Vegetables', 235, 6, a);
  insert into public.stock_events (id, household_id, item_id, kind, quantity, reason, price, bill_id, created_by)
  values (gen_random_uuid(), hid, tomato, 'delta', 1000, 'bought', 40, bill, a);
  select count(*) into n from public.stock_events where bill_id = bill and price = 40;
  if n <> 1 then raise exception 'FAIL: a priced purchase from a bill was not saved'; end if;
  ok := false;
  begin
    insert into public.stock_events (id, household_id, item_id, kind, quantity, price, created_by)
    values (gen_random_uuid(), hid, tomato, 'delta', 1000, -5, a);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL: a negative price was accepted'; end if;

  insert into public.bill_aliases (id, household_id, vendor, raw, item_id, created_by)
  values (alias, hid, 'murukan veketaples', 'peans', tomato, a);
  ok := false;
  begin
    insert into public.bill_aliases (id, household_id, vendor, raw, item_id, created_by)
    values (gen_random_uuid(), hid, 'murukan veketaples', 'peans', tomato, a);
  exception when unique_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL: the same shop word was mapped twice'; end if;
  -- The same word for any shop is a separate mapping.
  insert into public.bill_aliases (id, household_id, vendor, raw, item_id, created_by)
  values (gen_random_uuid(), hid, '', 'peans', tomato, a);
  update public.bill_aliases set item_id = tomato where id = alias;
  ok := false;
  begin
    update public.bill_aliases set raw = 'other' where id = alias;
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL: a bill word was changed'; end if;
  ok := false;
  begin
    update public.bills set total = 1 where id = bill;
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL: a bill was changed'; end if;

  -- ---- C, a stranger, sees and touches none of it ------------------------------------------
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  other_hid := public.create_household('Stranger home');
  select id into other_item from public.items where household_id = other_hid limit 1;
  select count(*) into n from public.bills where household_id = hid;
  if n <> 0 then raise exception 'FAIL: C sees A''s bills'; end if;
  select count(*) into n from public.bill_aliases where household_id = hid;
  if n <> 0 then raise exception 'FAIL: C sees A''s bill names'; end if;
  delete from public.bill_aliases where id = alias;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: C removed A''s bill name'; end if;
  ok := false;
  begin
    insert into public.bills (id, household_id, created_by) values (gen_random_uuid(), hid, c);
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL: C added a bill to A''s household'; end if;
  ok := false;
  begin
    insert into public.bill_aliases (id, household_id, raw, item_id, created_by) values (gen_random_uuid(), other_hid, 'x', tomato, c);
  exception when foreign_key_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL: a bill name pointed at another household''s item'; end if;

  -- ---- Restore: bills and names come back (names only for items there); older backup leaves them --
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.restore_snapshot(jsonb_build_object(
    'profiles', '[]'::jsonb,
    'bills', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'vendor', 'Anbu Stores', 'bill_date', '2026-10-01', 'lines', 3, 'created_by', a, 'created_at', now())),
    'bill_aliases', jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid(), 'vendor', '', 'raw', 'tenkai', 'item_id', tomato, 'created_by', a, 'created_at', now(), 'updated_at', now()),
      jsonb_build_object('id', gen_random_uuid(), 'vendor', '', 'raw', 'gone', 'item_id', other_item, 'created_by', a, 'created_at', now(), 'updated_at', now()))
  ));
  select count(*) into n from public.bills where household_id = hid;
  if n <> 1 then raise exception 'FAIL: restore should leave exactly 1 bill, got %', n; end if;
  select count(*) into n from public.bill_aliases where household_id = hid;
  if n <> 1 then raise exception 'FAIL: restore should leave exactly 1 bill name, got %', n; end if;

  perform public.restore_snapshot('{"profiles": []}'::jsonb);
  select count(*) into n from public.bill_aliases where household_id = hid;
  if n <> 1 then raise exception 'FAIL: a backup without bills changed the bill names'; end if;

  -- A deleted item takes its bill names with it.
  execute 'reset role';
  delete from public.items where id = tomato;
  select count(*) into n from public.bill_aliases where item_id = tomato;
  if n <> 0 then raise exception 'FAIL: a deleted item left its bill names'; end if;
end
$$;

select 'All bill checks passed' as result;

rollback;
