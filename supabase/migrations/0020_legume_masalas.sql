-- ============================================================================
-- PRABAS Food Planner · 0020 legume masalas (October 2026, fourth list)
--
-- Adds 4 gravies for chapati and rice: karamani masala, pachai payaru masala, black chana masala, mochai masala.
-- Each household gets the ones it doesn't have; no existing dish changes.
-- The same rows are in supabase/seed/dish_catalog.psv, so 0007 includes them for a fresh
-- database. Safe to run again. Apply 0017 to 0019 first.
-- ============================================================================

insert into private.dish_catalog (key, name_ta, name_en, aliases, type, meals, tags, ingredients, sides) values
  ('karamani_masala', 'காராமணி மசாலா', 'Karamani masala', array['karamani masala', 'karamani gravy', 'black eyed peas masala', 'lobia masala']::text[], 'kootu', array['lunch', 'dinner']::text[], array['protein', 'legume', 'fibre']::text[], '[{"item":"karamani","quantity":200},{"item":"periya_vengayam","quantity":150},{"item":"thakkali","quantity":200},{"item":"inji","quantity":10},{"item":"poondu","quantity":10},{"item":"malli_thool","quantity":10},{"item":"milagai_thool","quantity":10},{"item":"garam_masala","quantity":5},{"item":"kadalai_ennai","quantity":40}]'::jsonb, array[]::text[]),
  ('pachai_payaru_masala', 'பச்சைப் பயறு மசாலா', 'Pachai payaru masala', array['pachai payaru masala', 'pachai payaru gravy', 'patcha payiru masala', 'green gram masala', 'moong masala']::text[], 'kootu', array['lunch', 'dinner']::text[], array['protein', 'legume', 'fibre']::text[], '[{"item":"pachai_payaru","quantity":200},{"item":"periya_vengayam","quantity":150},{"item":"thakkali","quantity":200},{"item":"inji","quantity":10},{"item":"poondu","quantity":10},{"item":"malli_thool","quantity":10},{"item":"milagai_thool","quantity":10},{"item":"garam_masala","quantity":5},{"item":"kadalai_ennai","quantity":40}]'::jsonb, array[]::text[]),
  ('karuppu_kadalai_masala', 'கருப்புக் கொண்டைக்கடலை மசாலா', 'Black chana masala', array['karuppu kondakadalai masala', 'karuppu sundal masala', 'kala chana masala', 'black chana masala', 'kadala curry']::text[], 'kootu', array['lunch', 'dinner']::text[], array['protein', 'legume', 'fibre']::text[], '[{"item":"karuppu_kondakadalai","quantity":250},{"item":"periya_vengayam","quantity":200},{"item":"thakkali","quantity":250},{"item":"inji","quantity":15},{"item":"poondu","quantity":15},{"item":"garam_masala","quantity":10},{"item":"kadalai_ennai","quantity":40}]'::jsonb, array[]::text[]),
  ('mochai_masala', 'மொச்சை மசாலா', 'Mochai masala', array['mochai masala', 'mochai gravy', 'mochakotta masala', 'field beans masala']::text[], 'kootu', array['lunch', 'dinner']::text[], array['protein', 'legume', 'fibre']::text[], '[{"item":"mochai","quantity":250},{"item":"periya_vengayam","quantity":150},{"item":"thakkali","quantity":200},{"item":"inji","quantity":10},{"item":"poondu","quantity":10},{"item":"malli_thool","quantity":10},{"item":"milagai_thool","quantity":10},{"item":"garam_masala","quantity":5},{"item":"kadalai_ennai","quantity":40}]'::jsonb, array[]::text[])
on conflict (key) do update set
  name_ta = excluded.name_ta, name_en = excluded.name_en, aliases = excluded.aliases,
  type = excluded.type, meals = excluded.meals, tags = excluded.tags,
  ingredients = excluded.ingredients, sides = excluded.sides;

select private.seed_household_dishes(id) from public.households;
