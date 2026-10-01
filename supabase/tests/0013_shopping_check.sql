-- ============================================================================
-- Check for 0013_shopping. Paste into the Supabase SQL editor and run (after 0013 is
-- applied). Throwaway users, rolled back at the end. Success shows one result row,
-- "All shopping checks passed"; any failure stops with an error saying which.
-- ============================================================================

begin;

do $$
declare
  a uuid := gen_random_uuid();
  c uuid := gen_random_uuid();
  hid uuid;
  other_hid uuid;
  okra uuid;
  other_item uuid;
  want uuid := gen_random_uuid();
  skip uuid := gen_random_uuid();
  n int;
  ok boolean;
begin
  insert into auth.users (id, email, aud, role)
  values (a, 'shop-a@example.test', 'authenticated', 'authenticated'),
         (c, 'shop-c@example.test', 'authenticated', 'authenticated');

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  hid := public.create_household('Shop home');
  select id into okra from public.items where household_id = hid order by name_en limit 1;

  -- ---- Add by hand, once; skip; tick off -------------------------------------------------
  insert into public.shopping_items (id, household_id, item_id, kind, quantity, created_by)
  values (want, hid, okra, 'want', 500, a);
  ok := false;
  begin
    insert into public.shopping_items (id, household_id, item_id, kind, created_by)
    values (gen_random_uuid(), hid, okra, 'want', a);
  exception when unique_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL: the same item was added twice'; end if;

  insert into public.shopping_items (id, household_id, item_id, kind, skip_until, section, created_by)
  values (skip, hid, okra, 'skip', '2026-10-08', 'low', a);
  ok := false;
  begin
    insert into public.shopping_items (id, household_id, item_id, kind, created_by)
    values (gen_random_uuid(), hid, okra, 'skip', a);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL: a skip with no date was accepted'; end if;
  ok := false;
  begin
    insert into public.shopping_items (id, household_id, item_id, kind, section, skip_until, created_by)
    values (gen_random_uuid(), hid, okra, 'skip', 'someday', '2026-10-08', a);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL: an unknown section was accepted'; end if;

  ok := false;
  begin
    update public.shopping_items set done_at = now() where id = want;
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL: bought without saying who'; end if;
  update public.shopping_items set done_at = now(), done_by = a where id = want;
  select updated_by = a into ok from public.shopping_items where id = want;
  if not ok then raise exception 'FAIL: ticking off not attributed'; end if;
  -- Once bought, it can be added again.
  insert into public.shopping_items (id, household_id, item_id, kind, created_by)
  values (gen_random_uuid(), hid, okra, 'want', a);
  ok := false;
  begin
    update public.shopping_items set kind = 'skip' where id = want;
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL: a line''s kind was changed'; end if;
  ok := false;
  begin
    insert into public.shopping_items (id, household_id, item_id, kind, created_by)
    values (gen_random_uuid(), hid, okra, 'want', c);
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL: a line added as someone else was accepted'; end if;

  -- ---- C, a stranger, sees and touches none of it ------------------------------------------
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  other_hid := public.create_household('Stranger home');
  select id into other_item from public.items where household_id = other_hid limit 1;
  select count(*) into n from public.shopping_items where household_id = hid;
  if n <> 0 then raise exception 'FAIL: C sees A''s shopping list'; end if;
  delete from public.shopping_items where id = skip;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: C removed A''s line'; end if;
  ok := false;
  begin
    insert into public.shopping_items (id, household_id, item_id, kind, created_by)
    values (gen_random_uuid(), hid, okra, 'want', c);
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FAIL: C added to A''s list'; end if;
  -- Nor can C put A's item on C's own list.
  ok := false;
  begin
    insert into public.shopping_items (id, household_id, item_id, kind, created_by)
    values (gen_random_uuid(), other_hid, okra, 'want', c);
  exception when foreign_key_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL: a line pointed at another household''s item'; end if;

  -- ---- Restore: lines come back, only for items that are there; an older backup leaves them --
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.restore_snapshot(jsonb_build_object(
    'profiles', '[]'::jsonb,
    'shopping_items', jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid(), 'item_id', okra, 'kind', 'want', 'quantity', 250,
        'created_by', a, 'created_at', now(), 'updated_at', now()),
      jsonb_build_object('id', gen_random_uuid(), 'item_id', other_item, 'kind', 'want',
        'created_by', a, 'created_at', now(), 'updated_at', now()))
  ));
  select count(*) into n from public.shopping_items where household_id = hid;
  if n <> 1 then raise exception 'FAIL: restore should leave exactly 1 line, got %', n; end if;
  select count(*) into n from public.shopping_items where household_id = hid and quantity = 250;
  if n <> 1 then raise exception 'FAIL: the restored line is not the backup''s'; end if;

  perform public.restore_snapshot('{"profiles": []}'::jsonb);
  select count(*) into n from public.shopping_items where household_id = hid;
  if n <> 1 then raise exception 'FAIL: a backup without a shopping list changed it'; end if;

  -- A deleted item takes its lines with it (items can't be deleted in the app; the database can).
  execute 'reset role';
  delete from public.items where id = okra;
  select count(*) into n from public.shopping_items where item_id = okra;
  if n <> 0 then raise exception 'FAIL: a deleted item left its lines'; end if;
end
$$;

select 'All shopping checks passed' as result;

rollback;
