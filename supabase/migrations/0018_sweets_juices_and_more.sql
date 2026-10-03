-- ============================================================================
-- PRABAS Food Planner · 0018 sweets, juices and more dishes (October 2026)
--
-- Three new dish types, kept in the library but never suggested as a meal or a side:
-- sweet, juice (and lassi), salad_soup. Semiya payasam moves from snack to sweet.
-- Four items (fresh cream, noodles, cocoa powder, biscuits) and 32 dishes are added,
-- and each household gets the ones it doesn't have.
-- Names that now belong to their own dishes come off the old ones: onion chutney (was
-- on Kara chutney, which now answers to "tomato onion chutney"), egg masala (Egg
-- kuzhambu), mutton varuval and mutton fry (Mutton sukka), vanjiram fry (Fish fry).
-- Appam and idiyappam get coconut milk and vegetable stew as sides.
-- The same rows are in supabase/seed/*.psv, so 0005 and 0007 include them for a fresh
-- database. Safe to run again. Apply 0017 first.
-- ============================================================================

alter table public.dishes drop constraint dishes_type_check;
alter table public.dishes add constraint dishes_type_check check (type in (
  'tiffin', 'variety_rice', 'kuzhambu', 'sambar', 'rasam', 'poriyal', 'kootu',
  'chutney', 'nonveg_gravy', 'nonveg_fry', 'drink', 'snack', 'sweet', 'juice', 'salad_soup', 'prepared'));

-- The new items.
insert into private.item_catalog (
  key, name_ta, name_en, aliases, category, unit, display_unit, shelf_life_days,
  is_staple, low_threshold, piece_weight_g, has_opened_form, opened_shelf_life_days, step
) values
  ('fresh_cream', 'ஃப்ரெஷ் க்ரீம்', 'Fresh cream', array['fresh cream', 'cream', 'whipping cream']::text[], 'dairy', 'ml', 'ml', 5, false, null, null, false, null, 200),
  ('noodles', 'நூடுல்ஸ்', 'Noodles', array['noodles', 'hakka noodles', 'noodles packet']::text[], 'grain', 'packet', 'packet', null, false, null, null, false, null, 1),
  ('cocoa', 'கோகோ பவுடர்', 'Cocoa powder', array['cocoa', 'cocoa powder']::text[], 'other', 'g', 'g', null, false, null, null, false, null, 100),
  ('biscuit', 'பிஸ்கட்', 'Biscuits', array['biscuit', 'biscuits', 'marie biscuit', 'cookies']::text[], 'other', 'packet', 'packet', null, false, null, null, false, null, 1)
on conflict (key) do update set
  name_ta = excluded.name_ta, name_en = excluded.name_en, aliases = excluded.aliases,
  category = excluded.category, unit = excluded.unit, display_unit = excluded.display_unit,
  shelf_life_days = excluded.shelf_life_days, is_staple = excluded.is_staple,
  low_threshold = excluded.low_threshold, piece_weight_g = excluded.piece_weight_g,
  has_opened_form = excluded.has_opened_form, opened_shelf_life_days = excluded.opened_shelf_life_days,
  step = excluded.step;

select private.seed_household_items(id) from public.households;

-- The new dishes, and the catalogue rows of the dishes that changed.
insert into private.dish_catalog (key, name_ta, name_en, aliases, type, meals, tags, ingredients, sides) values
  ('idiyappam', 'இடியாப்பம்', 'Idiyappam', array['idiyappam', 'idiappam', 'string hoppers', 'sevai']::text[], 'tiffin', array['breakfast', 'dinner']::text[], array[]::text[], '[{"item":"arisi_mavu","quantity":500},{"item":"thengai","quantity":0.5,"optional":true}]'::jsonb, array['veg_kurma', 'kara_chutney', 'thengai_paal', 'veg_stew']::text[]),
  ('appam', 'ஆப்பம்', 'Appam', array['appam', 'aappam', 'palappam']::text[], 'tiffin', array['breakfast', 'dinner']::text[], array[]::text[], '[{"item":"pacharisi","quantity":500},{"item":"thengai","quantity":1},{"item":"sakkarai","quantity":20},{"item":"appa_soda","quantity":3}]'::jsonb, array['veg_kurma', 'muttai_kuzhambu', 'veg_stew', 'thengai_paal']::text[]),
  ('kara_chutney', 'கார சட்னி', 'Kara chutney', array['kara chutney', 'kaara chutney', 'red chutney', 'tomato onion chutney', 'tomato and onion chutney']::text[], 'chutney', array['breakfast', 'dinner']::text[], array[]::text[], '[{"item":"chinna_vengayam","quantity":200},{"item":"thakkali","quantity":150},{"item":"vara_milagai","quantity":8},{"item":"poondu","quantity":10},{"item":"puli","quantity":10},{"item":"nallennai","quantity":30}]'::jsonb, array[]::text[]),
  ('muttai_kuzhambu', 'முட்டைக் குழம்பு', 'Egg kuzhambu', array['muttai kuzhambu', 'muttai kulambu', 'egg kuzhambu', 'egg curry']::text[], 'nonveg_gravy', array['lunch', 'dinner']::text[], array['protein']::text[], '[{"item":"muttai","quantity":8},{"item":"periya_vengayam","quantity":200},{"item":"thakkali","quantity":200},{"item":"thengai","quantity":0.25},{"item":"inji","quantity":10},{"item":"poondu","quantity":10},{"item":"milagai_thool","quantity":10},{"item":"malli_thool","quantity":15},{"item":"kadalai_ennai","quantity":50}]'::jsonb, array['beans_poriyal']::text[]),
  ('mutton_sukka', 'மட்டன் சுக்கா', 'Mutton sukka', array['mutton sukka', 'mutton chukka']::text[], 'nonveg_fry', array['lunch']::text[], array['protein']::text[], '[{"item":"aattukari","quantity":1000},{"item":"chinna_vengayam","quantity":200},{"item":"milagu","quantity":15},{"item":"sombu","quantity":5},{"item":"inji","quantity":25},{"item":"poondu","quantity":25},{"item":"thengai","quantity":0.25,"optional":true},{"item":"kadalai_ennai","quantity":60},{"item":"karuveppilai","quantity":0.5}]'::jsonb, array[]::text[]),
  ('meen_varuval', 'மீன் வறுவல்', 'Fish fry', array['fish fry', 'meen varuval', 'meen fry']::text[], 'nonveg_fry', array['lunch', 'dinner']::text[], array['protein', 'fish']::text[], '[{"item":"vanjiram","quantity":750},{"item":"milagai_thool","quantity":15},{"item":"inji","quantity":15},{"item":"poondu","quantity":15},{"item":"elumichai","quantity":1},{"item":"arisi_mavu","quantity":20},{"item":"kadalai_ennai","quantity":100}]'::jsonb, array[]::text[]),
  ('payasam', 'சேமியா பாயசம்', 'Semiya payasam', array['payasam', 'semiya payasam', 'kheer', 'paayasam']::text[], 'sweet', array['lunch']::text[], array[]::text[], '[{"item":"semiya","quantity":1},{"item":"paal","quantity":1000},{"item":"sakkarai","quantity":200},{"item":"nei","quantity":30},{"item":"munthiri","quantity":25},{"item":"elakkai","quantity":3}]'::jsonb, array[]::text[]),
  ('veg_momos', 'வெஜ் மோமோஸ்', 'Veg momos', array['momos', 'veg momos', 'momo', 'dumplings']::text[], 'snack', array['dinner']::text[], array[]::text[], '[{"item":"maida","quantity":400},{"item":"muttaikose","quantity":300},{"item":"carrot","quantity":150},{"item":"periya_vengayam","quantity":150},{"item":"inji","quantity":10},{"item":"poondu","quantity":10},{"item":"kadalai_ennai","quantity":20}]'::jsonb, array[]::text[]),
  ('veg_noodles', 'வெஜ் நூடுல்ஸ்', 'Veg noodles', array['noodles', 'veg noodles', 'hakka noodles', 'chow mein']::text[], 'tiffin', array['dinner']::text[], array[]::text[], '[{"item":"noodles","quantity":2},{"item":"muttaikose","quantity":200},{"item":"carrot","quantity":150},{"item":"kudai_milagai","quantity":150},{"item":"periya_vengayam","quantity":100},{"item":"vengaya_thaal","quantity":1,"optional":true},{"item":"poondu","quantity":10},{"item":"kadalai_ennai","quantity":40}]'::jsonb, array[]::text[]),
  ('sandwich', 'சாண்ட்விச்', 'Sandwich', array['sandwich', 'veg sandwich', 'bread sandwich']::text[], 'tiffin', array['breakfast', 'dinner']::text[], array[]::text[], '[{"item":"bread","quantity":2},{"item":"urulaikizhangu","quantity":200},{"item":"vellarikkai","quantity":150},{"item":"thakkali","quantity":150},{"item":"vennai","quantity":40},{"item":"kothamalli","quantity":0.25,"optional":true}]'::jsonb, array[]::text[]),
  ('masala_vadai', 'மசால் வடை', 'Masala vadai', array['masala vadai', 'masal vadai', 'paruppu vadai', 'parippu vada']::text[], 'snack', array['breakfast']::text[], array['protein', 'legume']::text[], '[{"item":"kadalai_paruppu","quantity":300},{"item":"chinna_vengayam","quantity":150},{"item":"pachai_milagai","quantity":10},{"item":"inji","quantity":10},{"item":"sombu","quantity":5},{"item":"karuveppilai","quantity":0.25},{"item":"kothamalli","quantity":0.25,"optional":true},{"item":"kadalai_ennai","quantity":300}]'::jsonb, array['thengai_chutney']::text[]),
  ('soya_biryani', 'சோயா பிரியாணி', 'Soya biryani', array['soya biryani', 'meal maker biryani', 'soya chunks biryani']::text[], 'variety_rice', array['lunch', 'dinner']::text[], array['protein']::text[], '[{"item":"basmati","quantity":500},{"item":"soya","quantity":150},{"item":"periya_vengayam","quantity":200},{"item":"thakkali","quantity":150},{"item":"thayir","quantity":100},{"item":"inji","quantity":20},{"item":"poondu","quantity":20},{"item":"pudhina","quantity":0.5},{"item":"biryani_masala","quantity":15},{"item":"nei","quantity":30},{"item":"kadalai_ennai","quantity":40}]'::jsonb, array['vengaya_raita']::text[]),
  ('vengaya_chutney', 'வெங்காயச் சட்னி', 'Onion chutney', array['onion chutney', 'vengaya chutney', 'chinna vengaya chutney']::text[], 'chutney', array['breakfast', 'dinner']::text[], array[]::text[], '[{"item":"chinna_vengayam","quantity":200},{"item":"ulutham_paruppu","quantity":10},{"item":"vara_milagai","quantity":6},{"item":"puli","quantity":10},{"item":"kadalai_ennai","quantity":30}]'::jsonb, array[]::text[]),
  ('karuveppilai_chutney', 'கறிவேப்பிலைச் சட்னி', 'Curry leaf chutney', array['karuveppilai chutney', 'curry leaf chutney', 'curry leaves chutney']::text[], 'chutney', array['breakfast', 'dinner']::text[], array[]::text[], '[{"item":"karuveppilai","quantity":2},{"item":"ulutham_paruppu","quantity":20},{"item":"kadalai_paruppu","quantity":10},{"item":"vara_milagai","quantity":4},{"item":"puli","quantity":10},{"item":"thengai","quantity":0.25},{"item":"kadalai_ennai","quantity":15}]'::jsonb, array[]::text[]),
  ('thengai_paal', 'தேங்காய்ப் பால்', 'Coconut milk', array['coconut milk', 'thengai paal', 'sweet coconut milk']::text[], 'chutney', array['breakfast', 'dinner']::text[], array[]::text[], '[{"item":"thengai","quantity":2},{"item":"sakkarai","quantity":60},{"item":"elakkai","quantity":2,"optional":true}]'::jsonb, array[]::text[]),
  ('avitha_muttai', 'அவித்த முட்டை', 'Boiled egg', array['boiled egg', 'avicha muttai', 'avitha muttai', 'egg boiled']::text[], 'nonveg_fry', array['breakfast', 'lunch', 'dinner']::text[], array['protein']::text[], '[{"item":"muttai","quantity":5}]'::jsonb, array[]::text[]),
  ('veg_stew', 'காய்கறி ஸ்டூ', 'Vegetable stew', array['vegetable stew', 'veg stew', 'kerala stew', 'ishtu']::text[], 'kootu', array['breakfast', 'dinner']::text[], array[]::text[], '[{"item":"urulaikizhangu","quantity":200},{"item":"carrot","quantity":150},{"item":"beans","quantity":100},{"item":"pachai_pattani","quantity":100},{"item":"periya_vengayam","quantity":100},{"item":"thengai","quantity":1},{"item":"pachai_milagai","quantity":10},{"item":"inji","quantity":10},{"item":"thengai_ennai","quantity":30},{"item":"karuveppilai","quantity":0.25}]'::jsonb, array[]::text[]),
  ('muttai_masala', 'முட்டை மசாலா', 'Egg masala', array['egg masala', 'muttai masala', 'egg roast']::text[], 'nonveg_gravy', array['lunch', 'dinner']::text[], array['protein']::text[], '[{"item":"muttai","quantity":8},{"item":"periya_vengayam","quantity":250},{"item":"thakkali","quantity":200},{"item":"inji","quantity":15},{"item":"poondu","quantity":15},{"item":"milagai_thool","quantity":15},{"item":"malli_thool","quantity":10},{"item":"garam_masala","quantity":5},{"item":"kadalai_ennai","quantity":50}]'::jsonb, array['urulai_roast']::text[]),
  ('eral_kuzhambu', 'இறால் குழம்பு', 'Prawn kuzhambu', array['prawn kuzhambu', 'eral kuzhambu', 'era kuzhambu', 'prawn curry']::text[], 'nonveg_gravy', array['lunch', 'dinner']::text[], array['protein', 'fish']::text[], '[{"item":"eral","quantity":500},{"item":"chinna_vengayam","quantity":150},{"item":"thakkali","quantity":200},{"item":"puli","quantity":20},{"item":"thengai","quantity":0.5},{"item":"milagai_thool","quantity":15},{"item":"malli_thool","quantity":15},{"item":"kadalai_ennai","quantity":50},{"item":"karuveppilai","quantity":0.25}]'::jsonb, array['urulai_roast']::text[]),
  ('eral_kurma', 'இறால் காய்கறி குருமா', 'Prawn vegetable kurma', array['prawn kurma', 'prawn vegetable kurma', 'eral kurma', 'prawn salna']::text[], 'nonveg_gravy', array['breakfast', 'dinner']::text[], array['protein', 'fish']::text[], '[{"item":"eral","quantity":400},{"item":"urulaikizhangu","quantity":150},{"item":"carrot","quantity":100},{"item":"beans","quantity":100},{"item":"periya_vengayam","quantity":150},{"item":"thakkali","quantity":150},{"item":"thengai","quantity":0.5},{"item":"pottukadalai","quantity":20},{"item":"sombu","quantity":5},{"item":"inji","quantity":10},{"item":"poondu","quantity":10},{"item":"kadalai_ennai","quantity":40}]'::jsonb, array[]::text[]),
  ('nandu_thokku', 'நண்டுத் தொக்கு', 'Crab thokku', array['crab thokku', 'nandu thokku', 'crab masala', 'nandu masala']::text[], 'nonveg_fry', array['lunch', 'dinner']::text[], array['protein', 'fish']::text[], '[{"item":"nandu","quantity":1000},{"item":"chinna_vengayam","quantity":200},{"item":"thakkali","quantity":200},{"item":"inji","quantity":20},{"item":"poondu","quantity":20},{"item":"milagu","quantity":10},{"item":"milagai_thool","quantity":15},{"item":"kadalai_ennai","quantity":60},{"item":"karuveppilai","quantity":0.5}]'::jsonb, array[]::text[]),
  ('vanjiram_varuval', 'வஞ்சிரம் மீன் வறுவல்', 'Seer fish fry', array['vanjiram fry', 'vanjiram meen varuval', 'seer fish fry', 'king fish fry']::text[], 'nonveg_fry', array['lunch', 'dinner']::text[], array['protein', 'fish']::text[], '[{"item":"vanjiram","quantity":750},{"item":"milagai_thool","quantity":15},{"item":"inji","quantity":10},{"item":"poondu","quantity":10},{"item":"elumichai","quantity":1},{"item":"arisi_mavu","quantity":20},{"item":"kadalai_ennai","quantity":100}]'::jsonb, array[]::text[]),
  ('vavval_varuval', 'வவ்வால் மீன் வறுவல்', 'Pomfret fry', array['pomfret fry', 'vavval fry', 'vavval meen varuval', 'pomfret varuval']::text[], 'nonveg_fry', array['lunch', 'dinner']::text[], array['protein', 'fish']::text[], '[{"item":"vavval","quantity":750},{"item":"milagai_thool","quantity":15},{"item":"inji","quantity":10},{"item":"poondu","quantity":10},{"item":"elumichai","quantity":1},{"item":"arisi_mavu","quantity":20},{"item":"kadalai_ennai","quantity":100}]'::jsonb, array[]::text[]),
  ('rava_kesari', 'ரவா கேசரி', 'Rava kesari', array['rava kesari', 'kesari', 'kesari bath']::text[], 'sweet', array['lunch']::text[], array[]::text[], '[{"item":"ravai","quantity":200},{"item":"sakkarai","quantity":300},{"item":"nei","quantity":100},{"item":"munthiri","quantity":20},{"item":"ular_thiratchai","quantity":15},{"item":"elakkai","quantity":2}]'::jsonb, array[]::text[]),
  ('paal_payasam', 'பால் பாயசம்', 'Paal payasam', array['paal payasam', 'pal payasam', 'rice kheer']::text[], 'sweet', array['lunch']::text[], array[]::text[], '[{"item":"paal","quantity":1500},{"item":"pacharisi","quantity":75},{"item":"sakkarai","quantity":250},{"item":"elakkai","quantity":2},{"item":"munthiri","quantity":20},{"item":"nei","quantity":20}]'::jsonb, array[]::text[]),
  ('paruppu_payasam', 'பருப்பு பாயசம்', 'Paruppu payasam', array['paruppu payasam', 'moong dal payasam', 'pasi paruppu payasam']::text[], 'sweet', array['lunch']::text[], array['protein', 'legume']::text[], '[{"item":"pasi_paruppu","quantity":150},{"item":"vellam","quantity":250},{"item":"thengai","quantity":1},{"item":"elakkai","quantity":2},{"item":"munthiri","quantity":20},{"item":"nei","quantity":30}]'::jsonb, array[]::text[]),
  ('semiya_javvarisi_payasam', 'சேமியா ஜவ்வரிசி பாயசம்', 'Semiya javvarisi payasam', array['semiya javvarisi payasam', 'semiya sago payasam', 'vermicelli sago payasam']::text[], 'sweet', array['lunch']::text[], array[]::text[], '[{"item":"semiya","quantity":1},{"item":"javvarisi","quantity":50},{"item":"paal","quantity":1000},{"item":"sakkarai","quantity":200},{"item":"elakkai","quantity":2},{"item":"munthiri","quantity":20},{"item":"nei","quantity":20}]'::jsonb, array[]::text[]),
  ('brownie', 'பிரவுனி', 'Brownie (eggless)', array['brownie', 'eggless brownie', 'chocolate brownie']::text[], 'sweet', array['dinner']::text[], array[]::text[], '[{"item":"maida","quantity":150},{"item":"cocoa","quantity":50},{"item":"sakkarai","quantity":200},{"item":"vennai","quantity":120},{"item":"thayir","quantity":120}]'::jsonb, array[]::text[]),
  ('tiramisu', 'டிராமிசு', 'Tiramisu (eggless)', array['tiramisu', 'eggless tiramisu']::text[], 'sweet', array['dinner']::text[], array[]::text[], '[{"item":"biscuit","quantity":2},{"item":"fresh_cream","quantity":400},{"item":"kaapi_thool","quantity":15},{"item":"cocoa","quantity":15},{"item":"sakkarai","quantity":100}]'::jsonb, array[]::text[]),
  ('nellikai_juice', 'நெல்லிக்காய் ஜூஸ்', 'Amla juice', array['amla juice', 'nellikai juice', 'gooseberry juice']::text[], 'juice', array['breakfast']::text[], array[]::text[], '[{"item":"nellikai","quantity":200},{"item":"then","quantity":30,"optional":true}]'::jsonb, array[]::text[]),
  ('carrot_juice', 'கேரட் ஜூஸ்', 'Carrot juice', array['carrot juice']::text[], 'juice', array['breakfast']::text[], array[]::text[], '[{"item":"carrot","quantity":750}]'::jsonb, array[]::text[]),
  ('beetroot_juice', 'பீட்ரூட் ஜூஸ்', 'Beetroot juice', array['beetroot juice']::text[], 'juice', array['breakfast']::text[], array[]::text[], '[{"item":"beetroot","quantity":500},{"item":"elumichai","quantity":1,"optional":true}]'::jsonb, array[]::text[]),
  ('orange_juice', 'ஆரஞ்சு ஜூஸ்', 'Orange juice', array['orange juice']::text[], 'juice', array['breakfast']::text[], array[]::text[], '[{"item":"orange","quantity":10}]'::jsonb, array[]::text[]),
  ('mosambi_juice', 'சாத்துக்குடி ஜூஸ்', 'Mosambi juice', array['mosambi juice', 'sathukudi juice', 'sweet lime juice']::text[], 'juice', array['breakfast']::text[], array[]::text[], '[{"item":"sathukudi","quantity":10}]'::jsonb, array[]::text[]),
  ('watermelon_juice', 'தர்பூசணி ஜூஸ்', 'Watermelon juice', array['watermelon juice', 'tharbusani juice']::text[], 'juice', array['lunch']::text[], array[]::text[], '[{"item":"tharbusani","quantity":1500}]'::jsonb, array[]::text[]),
  ('abc_juice', 'ஏபிசி ஜூஸ்', 'ABC juice', array['abc juice', 'apple beetroot carrot juice']::text[], 'juice', array['breakfast']::text[], array[]::text[], '[{"item":"apple","quantity":2},{"item":"beetroot","quantity":250},{"item":"carrot","quantity":400}]'::jsonb, array[]::text[]),
  ('lassi', 'லஸ்ஸி', 'Lassi', array['lassi', 'sweet lassi']::text[], 'juice', array['lunch']::text[], array['curd']::text[], '[{"item":"thayir","quantity":1000},{"item":"sakkarai","quantity":100}]'::jsonb, array[]::text[]),
  ('veg_salad', 'காய்கறி சாலட்', 'Veg salad', array['veg salad', 'salad', 'vegetable salad', 'green salad']::text[], 'salad_soup', array['lunch', 'dinner']::text[], array['fibre']::text[], '[{"item":"vellarikkai","quantity":250},{"item":"carrot","quantity":150},{"item":"thakkali","quantity":150},{"item":"periya_vengayam","quantity":100},{"item":"elumichai","quantity":1},{"item":"milagu","quantity":2}]'::jsonb, array[]::text[]),
  ('veg_soup', 'காய்கறி சூப்', 'Vegetable soup', array['soup', 'veg soup', 'vegetable soup', 'clear soup']::text[], 'salad_soup', array['dinner']::text[], array['fibre']::text[], '[{"item":"carrot","quantity":150},{"item":"beans","quantity":100},{"item":"muttaikose","quantity":150},{"item":"pachai_pattani","quantity":50},{"item":"periya_vengayam","quantity":100},{"item":"poondu","quantity":10},{"item":"milagu","quantity":3},{"item":"vennai","quantity":20}]'::jsonb, array[]::text[])
on conflict (key) do update set
  name_ta = excluded.name_ta, name_en = excluded.name_en, aliases = excluded.aliases,
  type = excluded.type, meals = excluded.meals, tags = excluded.tags,
  ingredients = excluded.ingredients, sides = excluded.sides;

select private.seed_household_dishes(id) from public.households;

-- In each household: semiya payasam is a sweet (unless someone changed its type).
update public.dishes set type = 'sweet' where catalog_key = 'payasam' and type = 'snack';

-- Names that belong to their own dishes now (only where the name is still there).
update public.dishes set aliases = array_remove(array_remove(aliases, 'onion chutney'), 'vengaya chutney')
where catalog_key = 'kara_chutney';
update public.dishes set aliases = aliases || array['tomato onion chutney', 'tomato and onion chutney']
where catalog_key = 'kara_chutney' and not 'tomato onion chutney' = any (aliases);
update public.dishes set aliases = array_remove(aliases, 'egg masala') where catalog_key = 'muttai_kuzhambu';
update public.dishes set aliases = array_remove(array_remove(aliases, 'mutton varuval'), 'mutton fry') where catalog_key = 'mutton_sukka';
update public.dishes set aliases = array_remove(aliases, 'vanjiram fry') where catalog_key = 'meen_varuval';

-- Coconut milk and vegetable stew with appam and idiyappam.
update public.dishes d set side_ids = d.side_ids || array(
  select s.id from unnest(array['veg_stew', 'thengai_paal']::text[]) with ordinality as k (key, ord)
  join public.dishes s on s.household_id = d.household_id and s.catalog_key = k.key
  where not s.id = any (d.side_ids) and s.id <> d.id
  order by k.ord)
where d.catalog_key = 'appam' and cardinality(d.side_ids) < 9;
update public.dishes d set side_ids = d.side_ids || array(
  select s.id from unnest(array['thengai_paal', 'veg_stew']::text[]) with ordinality as k (key, ord)
  join public.dishes s on s.household_id = d.household_id and s.catalog_key = k.key
  where not s.id = any (d.side_ids) and s.id <> d.id
  order by k.ord)
where d.catalog_key = 'idiyappam' and cardinality(d.side_ids) < 9;
