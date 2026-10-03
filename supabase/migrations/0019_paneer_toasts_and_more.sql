-- ============================================================================
-- PRABAS Food Planner · 0019 more dishes (October 2026, third list)
--
-- Adds one item (pani puri shells) and 8 dishes: bisi bele bath, kadai paneer, paneer bhurji, paneer sandwich, cheese toast, pani puri, french toast, onion mint tomato chutney.
-- Each household gets the ones it doesn't have.
-- Bisi bele bath is its own dish now, so its names come off Sambar rice. Kadai paneer
-- and paneer bhurji become sides for chapati.
-- The same rows are in supabase/seed/*.psv, so 0005 and 0007 include them for a fresh
-- database. Safe to run again. Apply 0017 and 0018 first.
-- ============================================================================

-- The new item.
insert into private.item_catalog (
  key, name_ta, name_en, aliases, category, unit, display_unit, shelf_life_days,
  is_staple, low_threshold, piece_weight_g, has_opened_form, opened_shelf_life_days, step
) values
  ('pani_puri', 'பானி பூரி', 'Pani puri shells', array['pani puri', 'puri shells', 'golgappa', 'puchka']::text[], 'other', 'packet', 'packet', null, false, null, null, false, null, 1)
on conflict (key) do update set
  name_ta = excluded.name_ta, name_en = excluded.name_en, aliases = excluded.aliases,
  category = excluded.category, unit = excluded.unit, display_unit = excluded.display_unit,
  shelf_life_days = excluded.shelf_life_days, is_staple = excluded.is_staple,
  low_threshold = excluded.low_threshold, piece_weight_g = excluded.piece_weight_g,
  has_opened_form = excluded.has_opened_form, opened_shelf_life_days = excluded.opened_shelf_life_days,
  step = excluded.step;

select private.seed_household_items(id) from public.households;

-- The new dishes.
insert into private.dish_catalog (key, name_ta, name_en, aliases, type, meals, tags, ingredients, sides) values
  ('bisibelebath', 'பிசிபேளாபாத்', 'Bisi bele bath', array['bisibelebath', 'bisi bele bath', 'bisibellebath', 'bisi bele bhath']::text[], 'variety_rice', array['lunch', 'dinner']::text[], array['protein', 'legume']::text[], '[{"item":"pacharisi","quantity":300},{"item":"thuvaram_paruppu","quantity":150},{"item":"carrot","quantity":100},{"item":"beans","quantity":100},{"item":"pachai_pattani","quantity":50},{"item":"urulaikizhangu","quantity":100},{"item":"chinna_vengayam","quantity":100},{"item":"thakkali","quantity":100},{"item":"puli","quantity":20},{"item":"sambar_podi","quantity":30},{"item":"nei","quantity":40},{"item":"munthiri","quantity":15,"optional":true}]'::jsonb, array['urulai_roast', 'vengaya_raita']::text[]),
  ('kadai_paneer', 'கடாய் பனீர்', 'Kadai paneer', array['kadai paneer', 'karahi paneer', 'kadai panner']::text[], 'kootu', array['dinner']::text[], array['protein']::text[], '[{"item":"paneer","quantity":400},{"item":"kudai_milagai","quantity":200},{"item":"periya_vengayam","quantity":150},{"item":"thakkali","quantity":250},{"item":"inji","quantity":10},{"item":"poondu","quantity":10},{"item":"malli","quantity":10},{"item":"vara_milagai","quantity":4},{"item":"garam_masala","quantity":5},{"item":"kadalai_ennai","quantity":40}]'::jsonb, array[]::text[]),
  ('paneer_bhurji', 'பனீர் புர்ஜி', 'Paneer bhurji', array['paneer bhurji', 'paneer burji', 'panner burji', 'paneer scramble']::text[], 'poriyal', array['breakfast', 'dinner']::text[], array['protein']::text[], '[{"item":"paneer","quantity":400},{"item":"periya_vengayam","quantity":150},{"item":"thakkali","quantity":150},{"item":"kudai_milagai","quantity":100},{"item":"pachai_milagai","quantity":10},{"item":"inji","quantity":10},{"item":"garam_masala","quantity":3},{"item":"kadalai_ennai","quantity":30},{"item":"kothamalli","quantity":0.25,"optional":true}]'::jsonb, array[]::text[]),
  ('paneer_sandwich', 'பனீர் சாண்ட்விச்', 'Paneer sandwich', array['paneer sandwich', 'panner sandwich', 'paneer toast sandwich']::text[], 'tiffin', array['breakfast', 'dinner']::text[], array['protein']::text[], '[{"item":"bread","quantity":2},{"item":"paneer","quantity":250},{"item":"periya_vengayam","quantity":100},{"item":"kudai_milagai","quantity":100},{"item":"thakkali","quantity":100},{"item":"vennai","quantity":40},{"item":"pudhina","quantity":0.25,"optional":true}]'::jsonb, array[]::text[]),
  ('cheese_toast', 'சீஸ் டோஸ்ட்', 'Cheese toast', array['cheese toast', 'cheese bread toast', 'chilli cheese toast']::text[], 'tiffin', array['breakfast', 'dinner']::text[], array[]::text[], '[{"item":"bread","quantity":2},{"item":"cheese","quantity":200},{"item":"vennai","quantity":30},{"item":"kudai_milagai","quantity":50,"optional":true},{"item":"milagu","quantity":2}]'::jsonb, array[]::text[]),
  ('pani_puri', 'பானி பூரி', 'Pani puri', array['pani puri', 'panipuri', 'golgappa', 'puchka']::text[], 'snack', array['dinner']::text[], array[]::text[], '[{"item":"pani_puri","quantity":2},{"item":"urulaikizhangu","quantity":300},{"item":"vellai_kondakadalai","quantity":100},{"item":"pudhina","quantity":1},{"item":"kothamalli","quantity":0.5},{"item":"puli","quantity":30},{"item":"seeragam","quantity":5},{"item":"pachai_milagai","quantity":15},{"item":"vellam","quantity":30}]'::jsonb, array[]::text[]),
  ('french_toast', 'பிரெஞ்சு டோஸ்ட்', 'French toast', array['french toast', 'bread toast', 'egg toast']::text[], 'tiffin', array['breakfast']::text[], array[]::text[], '[{"item":"bread","quantity":2},{"item":"muttai","quantity":5},{"item":"paal","quantity":200},{"item":"sakkarai","quantity":40},{"item":"vennai","quantity":40}]'::jsonb, array[]::text[]),
  ('vengaya_pudhina_thakkali_chutney', 'வெங்காய புதினா தக்காளி சட்னி', 'Onion mint tomato chutney', array['onion mint tomato chutney', 'onion tomato mint chutney', 'pudhina thakkali chutney', 'mint tomato chutney']::text[], 'chutney', array['breakfast', 'dinner']::text[], array[]::text[], '[{"item":"periya_vengayam","quantity":150},{"item":"thakkali","quantity":200},{"item":"pudhina","quantity":1},{"item":"vara_milagai","quantity":5},{"item":"ulutham_paruppu","quantity":10},{"item":"puli","quantity":5},{"item":"kadalai_ennai","quantity":30}]'::jsonb, array[]::text[])
on conflict (key) do update set
  name_ta = excluded.name_ta, name_en = excluded.name_en, aliases = excluded.aliases,
  type = excluded.type, meals = excluded.meals, tags = excluded.tags,
  ingredients = excluded.ingredients, sides = excluded.sides;

select private.seed_household_dishes(id) from public.households;

-- The two dishes that changed, in the catalogue: only what changed, so chapati keeps what
-- 0012 gave it (it uses dough, and has thokku as a side).
update private.dish_catalog set aliases = array_remove(array_remove(aliases, 'bisibelebath'), 'bisi bele bath')
where key = 'sambar_sadam';
update private.dish_catalog set sides = sides || array(
  select k from unnest(array['kadai_paneer', 'paneer_bhurji']::text[]) k where not k = any (sides))
where key = 'chapathi';

-- Bisi bele bath's names come off Sambar rice (only where they're still there).
update public.dishes set aliases = array_remove(array_remove(aliases, 'bisibelebath'), 'bisi bele bath')
where catalog_key = 'sambar_sadam';

-- Kadai paneer and paneer bhurji with chapati.
update public.dishes d set side_ids = d.side_ids || array(
  select s.id from unnest(array['kadai_paneer', 'paneer_bhurji']::text[]) with ordinality as k (key, ord)
  join public.dishes s on s.household_id = d.household_id and s.catalog_key = k.key
  where not s.id = any (d.side_ids) and s.id <> d.id
  order by k.ord)
where d.catalog_key = 'chapathi' and cardinality(d.side_ids) < 9;
