-- ============================================================================
-- PRABAS Food Planner · 0017 more dishes (October 2026)
--
-- Adds one item (pasta) and ten dishes to the catalogues, then gives every existing
-- household the ones it doesn't have yet. Dishes a household has edited are left alone.
-- The same rows are in supabase/seed/*.psv, so 0005 and 0007 (generated, safe to run
-- again) include them for a fresh database; this file is for one that's already set up.
--
-- Dishes: Pasta, Cucumber pachadi, Paneer roll, Chicken 65, Tandoori chicken, Chicken chukka, Mutton varuval, Egg chutney, Tomato kurma, Tomato sambar.
-- Also: "chicken 65" is no longer another name for Chicken fry, now that it's a dish.
-- ============================================================================

-- The pasta item.
insert into private.item_catalog (
  key, name_ta, name_en, aliases, category, unit, display_unit, shelf_life_days,
  is_staple, low_threshold, piece_weight_g, has_opened_form, opened_shelf_life_days, step
) values
  ('pasta', 'பாஸ்தா', 'Pasta', array['pasta', 'macaroni', 'penne']::text[], 'grain', 'g', 'kg', null, false, null, null, false, null, 500)
on conflict (key) do update set
  name_ta = excluded.name_ta, name_en = excluded.name_en, aliases = excluded.aliases,
  category = excluded.category, unit = excluded.unit, display_unit = excluded.display_unit,
  shelf_life_days = excluded.shelf_life_days, is_staple = excluded.is_staple,
  low_threshold = excluded.low_threshold, piece_weight_g = excluded.piece_weight_g,
  has_opened_form = excluded.has_opened_form, opened_shelf_life_days = excluded.opened_shelf_life_days,
  step = excluded.step;

select private.seed_household_items(id) from public.households;

-- The ten dishes.
insert into private.dish_catalog (key, name_ta, name_en, aliases, type, meals, tags, ingredients, sides) values
  ('pasta', 'பாஸ்தா', 'Pasta', array['pasta', 'masala pasta', 'macaroni']::text[], 'tiffin', array['lunch', 'dinner']::text[], array[]::text[], '[{"item":"pasta","quantity":500},{"item":"thakkali","quantity":400},{"item":"periya_vengayam","quantity":150},{"item":"kudai_milagai","quantity":150},{"item":"carrot","quantity":100},{"item":"poondu","quantity":15},{"item":"vennai","quantity":30},{"item":"cheese","quantity":50,"optional":true}]'::jsonb, array[]::text[]),
  ('vellarikkai_pachadi', 'வெள்ளரிக்காய் பச்சடி', 'Cucumber pachadi', array['cucumber pachadi', 'cucumber raita', 'vellarikai pachadi', 'vellarikkai thayir pachadi']::text[], 'chutney', array['lunch']::text[], array['curd']::text[], '[{"item":"thayir","quantity":400},{"item":"vellarikkai","quantity":250},{"item":"pachai_milagai","quantity":5},{"item":"kothamalli","quantity":0.25,"optional":true}]'::jsonb, array[]::text[]),
  ('paneer_roll', 'பனீர் ரோல்', 'Paneer roll', array['paneer roll', 'paneer wrap', 'paneer frankie', 'paneer kathi roll']::text[], 'snack', array['dinner']::text[], array['protein']::text[], '[{"item":"paneer","quantity":400},{"item":"godhumai_mavu","quantity":400},{"item":"periya_vengayam","quantity":150},{"item":"kudai_milagai","quantity":150},{"item":"thakkali","quantity":100},{"item":"thayir","quantity":100},{"item":"garam_masala","quantity":5},{"item":"kadalai_ennai","quantity":60}]'::jsonb, array[]::text[]),
  ('chicken_65', 'சிக்கன் 65', 'Chicken 65', array['chicken 65', 'chicken sixty five', 'kozhi 65']::text[], 'nonveg_fry', array['lunch', 'dinner']::text[], array['protein']::text[], '[{"item":"kozhi_boneless","quantity":1000},{"item":"thayir","quantity":100},{"item":"inji","quantity":20},{"item":"poondu","quantity":20},{"item":"milagai_thool","quantity":20},{"item":"arisi_mavu","quantity":50},{"item":"kadalai_ennai","quantity":300},{"item":"karuveppilai","quantity":0.5}]'::jsonb, array[]::text[]),
  ('tandoori_chicken', 'தந்தூரி சிக்கன்', 'Tandoori chicken', array['tandoori chicken', 'tandoori', 'tandoori kozhi']::text[], 'nonveg_fry', array['dinner']::text[], array['protein']::text[], '[{"item":"kozhi","quantity":1200},{"item":"thayir","quantity":200},{"item":"inji","quantity":20},{"item":"poondu","quantity":20},{"item":"milagai_thool","quantity":15},{"item":"garam_masala","quantity":10},{"item":"elumichai","quantity":1},{"item":"vennai","quantity":30}]'::jsonb, array[]::text[]),
  ('chicken_chukka', 'சிக்கன் சுக்கா', 'Chicken chukka', array['chicken chukka', 'chicken sukka', 'kozhi chukka', 'kozhi sukka']::text[], 'nonveg_fry', array['lunch', 'dinner']::text[], array['protein']::text[], '[{"item":"kozhi","quantity":1000},{"item":"chinna_vengayam","quantity":200},{"item":"milagu","quantity":15},{"item":"sombu","quantity":5},{"item":"vara_milagai","quantity":6},{"item":"inji","quantity":20},{"item":"poondu","quantity":20},{"item":"karuveppilai","quantity":0.5},{"item":"kadalai_ennai","quantity":60}]'::jsonb, array['milagu_rasam']::text[]),
  ('mutton_varuval', 'மட்டன் வறுவல்', 'Mutton varuval', array['mutton varuval', 'mutton fry', 'aattukari varuval', 'attukari varuval']::text[], 'nonveg_fry', array['lunch']::text[], array['protein']::text[], '[{"item":"aattukari","quantity":1000},{"item":"chinna_vengayam","quantity":200},{"item":"inji","quantity":20},{"item":"poondu","quantity":20},{"item":"milagai_thool","quantity":15},{"item":"malli_thool","quantity":15},{"item":"milagu","quantity":10},{"item":"karuveppilai","quantity":0.5},{"item":"kadalai_ennai","quantity":60}]'::jsonb, array['milagu_rasam']::text[]),
  ('muttai_chutney', 'முட்டை சட்னி', 'Egg chutney', array['egg chutney', 'muttai chutney', 'mutta chutney']::text[], 'chutney', array['breakfast', 'dinner']::text[], array['protein']::text[], '[{"item":"muttai","quantity":5},{"item":"periya_vengayam","quantity":200},{"item":"thakkali","quantity":200},{"item":"pachai_milagai","quantity":10},{"item":"milagai_thool","quantity":10},{"item":"kadalai_ennai","quantity":40},{"item":"karuveppilai","quantity":0.25}]'::jsonb, array[]::text[]),
  ('thakkali_kurma', 'தக்காளி குருமா', 'Tomato kurma', array['thakkali kurma', 'tomato kurma', 'thakkali korma', 'tomato korma']::text[], 'kootu', array['breakfast', 'dinner']::text[], array[]::text[], '[{"item":"thakkali","quantity":500},{"item":"periya_vengayam","quantity":150},{"item":"thengai","quantity":0.5},{"item":"pottukadalai","quantity":20},{"item":"sombu","quantity":5},{"item":"inji","quantity":10},{"item":"poondu","quantity":10},{"item":"pachai_milagai","quantity":10},{"item":"kadalai_ennai","quantity":40}]'::jsonb, array[]::text[]),
  ('thakkali_sambar', 'தக்காளி சாம்பார்', 'Tomato sambar', array['thakkali sambar', 'tomato sambar']::text[], 'sambar', array['breakfast', 'lunch']::text[], array['protein', 'legume']::text[], '[{"item":"thuvaram_paruppu","quantity":150},{"item":"thakkali","quantity":400},{"item":"chinna_vengayam","quantity":100},{"item":"puli","quantity":15},{"item":"sambar_podi","quantity":30},{"item":"kadalai_ennai","quantity":30}]'::jsonb, array['urulai_roast', 'beans_poriyal']::text[])
on conflict (key) do update set
  name_ta = excluded.name_ta, name_en = excluded.name_en, aliases = excluded.aliases,
  type = excluded.type, meals = excluded.meals, tags = excluded.tags,
  ingredients = excluded.ingredients, sides = excluded.sides;

select private.seed_household_dishes(id) from public.households;

-- Chicken 65 is its own dish now: take the name off Chicken fry, in the catalogue and in
-- each household (only where the name is still there).
update private.dish_catalog set aliases = array_remove(aliases, 'chicken 65') where key = 'chicken_varuval';
update public.dishes set aliases = array_remove(aliases, 'chicken 65')
where catalog_key = 'chicken_varuval' and 'chicken 65' = any (aliases);
