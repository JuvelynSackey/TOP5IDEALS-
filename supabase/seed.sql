-- =============================================================================
-- Top5Ideals catalogue seed (brands + phone models).
-- Idempotent: safe to run repeatedly; existing rows are updated by slug and
-- never duplicated. Contains NO demo users or listings — production-safe.
-- =============================================================================

insert into public.brands (name, slug, sort_order) values
  ('Apple', 'apple', 10),
  ('Samsung', 'samsung', 20),
  ('Google', 'google', 30),
  ('Tecno', 'tecno', 40),
  ('Infinix', 'infinix', 50),
  ('Xiaomi', 'xiaomi', 60),
  ('OnePlus', 'oneplus', 70),
  ('Huawei', 'huawei', 80),
  ('Nokia', 'nokia', 90),
  ('itel', 'itel', 100),
  ('Oppo', 'oppo', 110),
  ('Other', 'other', 999)
on conflict (slug) do update set name = excluded.name, sort_order = excluded.sort_order;

with data (brand_slug, name, slug, release_year, storage, ram, battery_supported) as (
  values
    -- Apple (iOS reports battery health)
    ('apple', 'iPhone 11', 'iphone-11', 2019, '{64,128,256}', '{4}', true),
    ('apple', 'iPhone 11 Pro Max', 'iphone-11-pro-max', 2019, '{64,256,512}', '{4}', true),
    ('apple', 'iPhone 12', 'iphone-12', 2020, '{64,128,256}', '{4}', true),
    ('apple', 'iPhone 12 Pro Max', 'iphone-12-pro-max', 2020, '{128,256,512}', '{6}', true),
    ('apple', 'iPhone 13', 'iphone-13', 2021, '{128,256,512}', '{4}', true),
    ('apple', 'iPhone 13 Pro', 'iphone-13-pro', 2021, '{128,256,512,1024}', '{6}', true),
    ('apple', 'iPhone 13 Pro Max', 'iphone-13-pro-max', 2021, '{128,256,512,1024}', '{6}', true),
    ('apple', 'iPhone 14', 'iphone-14', 2022, '{128,256,512}', '{6}', true),
    ('apple', 'iPhone 14 Pro', 'iphone-14-pro', 2022, '{128,256,512,1024}', '{6}', true),
    ('apple', 'iPhone 14 Pro Max', 'iphone-14-pro-max', 2022, '{128,256,512,1024}', '{6}', true),
    ('apple', 'iPhone 15', 'iphone-15', 2023, '{128,256,512}', '{6}', true),
    ('apple', 'iPhone 15 Pro', 'iphone-15-pro', 2023, '{128,256,512,1024}', '{8}', true),
    ('apple', 'iPhone 15 Pro Max', 'iphone-15-pro-max', 2023, '{256,512,1024}', '{8}', true),
    ('apple', 'iPhone 16', 'iphone-16', 2024, '{128,256,512}', '{8}', true),
    ('apple', 'iPhone 16 Pro', 'iphone-16-pro', 2024, '{128,256,512,1024}', '{8}', true),
    ('apple', 'iPhone 16 Pro Max', 'iphone-16-pro-max', 2024, '{256,512,1024}', '{8}', true),
    ('apple', 'iPhone XR', 'iphone-xr', 2018, '{64,128,256}', '{3}', true),
    -- Samsung
    ('samsung', 'Galaxy S21 Ultra', 'galaxy-s21-ultra', 2021, '{128,256,512}', '{12,16}', false),
    ('samsung', 'Galaxy S22', 'galaxy-s22', 2022, '{128,256}', '{8}', false),
    ('samsung', 'Galaxy S22 Ultra', 'galaxy-s22-ultra', 2022, '{128,256,512,1024}', '{8,12}', false),
    ('samsung', 'Galaxy S23', 'galaxy-s23', 2023, '{128,256,512}', '{8}', false),
    ('samsung', 'Galaxy S23 Ultra', 'galaxy-s23-ultra', 2023, '{256,512,1024}', '{8,12}', false),
    ('samsung', 'Galaxy S24', 'galaxy-s24', 2024, '{128,256,512}', '{8}', false),
    ('samsung', 'Galaxy S24 Ultra', 'galaxy-s24-ultra', 2024, '{256,512,1024}', '{12}', false),
    ('samsung', 'Galaxy A15', 'galaxy-a15', 2023, '{128,256}', '{4,6,8}', false),
    ('samsung', 'Galaxy A25', 'galaxy-a25', 2023, '{128,256}', '{6,8}', false),
    ('samsung', 'Galaxy A35', 'galaxy-a35', 2024, '{128,256}', '{6,8}', false),
    ('samsung', 'Galaxy A55', 'galaxy-a55', 2024, '{128,256}', '{8,12}', false),
    ('samsung', 'Galaxy Z Flip5', 'galaxy-z-flip5', 2023, '{256,512}', '{8}', false),
    ('samsung', 'Galaxy Z Fold5', 'galaxy-z-fold5', 2023, '{256,512,1024}', '{12}', false),
    -- Google
    ('google', 'Pixel 6', 'pixel-6', 2021, '{128,256}', '{8}', false),
    ('google', 'Pixel 7', 'pixel-7', 2022, '{128,256}', '{8}', false),
    ('google', 'Pixel 7 Pro', 'pixel-7-pro', 2022, '{128,256,512}', '{12}', false),
    ('google', 'Pixel 8', 'pixel-8', 2023, '{128,256}', '{8}', true),
    ('google', 'Pixel 8 Pro', 'pixel-8-pro', 2023, '{128,256,512,1024}', '{12}', true),
    ('google', 'Pixel 9', 'pixel-9', 2024, '{128,256}', '{12}', true),
    ('google', 'Pixel 9 Pro', 'pixel-9-pro', 2024, '{128,256,512,1024}', '{16}', true),
    -- Tecno
    ('tecno', 'Camon 20', 'camon-20', 2023, '{128,256}', '{8}', false),
    ('tecno', 'Camon 30', 'camon-30', 2024, '{256,512}', '{8,12}', false),
    ('tecno', 'Spark 20', 'spark-20', 2023, '{128,256}', '{8}', false),
    ('tecno', 'Spark 20 Pro', 'spark-20-pro', 2023, '{256}', '{8}', false),
    ('tecno', 'Pova 6 Pro', 'pova-6-pro', 2024, '{256}', '{8,12}', false),
    ('tecno', 'Phantom V Fold', 'phantom-v-fold', 2023, '{256,512}', '{12}', false),
    -- Infinix
    ('infinix', 'Hot 40', 'hot-40', 2023, '{128,256}', '{8}', false),
    ('infinix', 'Hot 40 Pro', 'hot-40-pro', 2023, '{256}', '{8}', false),
    ('infinix', 'Note 30', 'note-30', 2023, '{128,256}', '{8}', false),
    ('infinix', 'Note 40 Pro', 'note-40-pro', 2024, '{256}', '{8,12}', false),
    ('infinix', 'Zero 30', 'zero-30', 2023, '{256}', '{8,12}', false),
    ('infinix', 'Smart 8', 'smart-8', 2023, '{64,128}', '{3,4}', false),
    -- Xiaomi
    ('xiaomi', 'Redmi Note 12', 'redmi-note-12', 2023, '{64,128,256}', '{4,6,8}', false),
    ('xiaomi', 'Redmi Note 13', 'redmi-note-13', 2024, '{128,256}', '{6,8}', false),
    ('xiaomi', 'Redmi Note 13 Pro', 'redmi-note-13-pro', 2024, '{256,512}', '{8,12}', false),
    ('xiaomi', 'Redmi 13C', 'redmi-13c', 2023, '{128,256}', '{4,6,8}', false),
    ('xiaomi', 'Xiaomi 13T', 'xiaomi-13t', 2023, '{256}', '{8,12}', false),
    ('xiaomi', 'Xiaomi 14', 'xiaomi-14', 2024, '{256,512}', '{12}', false),
    -- OnePlus
    ('oneplus', 'OnePlus 11', 'oneplus-11', 2023, '{128,256}', '{8,16}', false),
    ('oneplus', 'OnePlus 12', 'oneplus-12', 2024, '{256,512}', '{12,16}', false),
    ('oneplus', 'OnePlus Nord 3', 'oneplus-nord-3', 2023, '{128,256}', '{8,16}', false),
    ('oneplus', 'OnePlus Nord CE 3 Lite', 'oneplus-nord-ce-3-lite', 2023, '{128,256}', '{8}', false),
    -- Huawei
    ('huawei', 'P30 Pro', 'huawei-p30-pro', 2019, '{128,256,512}', '{8}', false),
    ('huawei', 'P60 Pro', 'huawei-p60-pro', 2023, '{256,512}', '{8,12}', false),
    ('huawei', 'Nova 11', 'huawei-nova-11', 2023, '{256}', '{8}', false),
    ('huawei', 'Nova Y91', 'huawei-nova-y91', 2023, '{128,256}', '{8}', false),
    -- Nokia
    ('nokia', 'G42', 'nokia-g42', 2023, '{128}', '{4,6}', false),
    ('nokia', 'C32', 'nokia-c32', 2023, '{64,128}', '{3,4}', false),
    ('nokia', 'X30', 'nokia-x30', 2022, '{128,256}', '{6,8}', false),
    -- itel
    ('itel', 'S23', 'itel-s23', 2023, '{128,256}', '{4,8}', false),
    ('itel', 'A70', 'itel-a70', 2023, '{64,128,256}', '{3,4}', false),
    ('itel', 'P55', 'itel-p55', 2023, '{128,256}', '{4,8}', false),
    -- Oppo
    ('oppo', 'Reno 10', 'oppo-reno-10', 2023, '{256}', '{8}', false),
    ('oppo', 'Reno 11', 'oppo-reno-11', 2024, '{256}', '{8,12}', false),
    ('oppo', 'A78', 'oppo-a78', 2023, '{128,256}', '{8}', false),
    -- Other
    ('other', 'Other model', 'other-model', null, '{}', '{}', false)
)
insert into public.phone_models (brand_id, name, slug, release_year, storage_options_gb, ram_options_gb, battery_health_supported)
select b.id, d.name, d.slug, d.release_year, d.storage::integer[], d.ram::integer[], d.battery_supported
from data d
join public.brands b on b.slug = d.brand_slug
on conflict (slug) do update
  set name = excluded.name,
      release_year = excluded.release_year,
      storage_options_gb = excluded.storage_options_gb,
      ram_options_gb = excluded.ram_options_gb,
      battery_health_supported = excluded.battery_health_supported;
