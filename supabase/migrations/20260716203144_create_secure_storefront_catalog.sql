-- Public catalog boundary for the independent Chetech storefront.
-- The administrative SKU is copied byte-for-byte from public.products.sku.
-- Costs, margins, private notes and exact stock never enter the public table.

create schema if not exists private;

create table if not exists public.storefront_products (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null unique references public.products(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  sku text not null unique,
  name text not null,
  short_description text not null default '',
  description text not null default '',
  description_status text not null default 'pending_review'
    check (description_status in ('generated','pending_review','manually_reviewed')),
  description_generated_at timestamptz,
  description_reviewed_at timestamptz,
  category_name text not null default 'Otros',
  category_slug text not null default 'otros',
  brand text not null default '',
  model text not null default '',
  public_price numeric(12,2) not null default 0 check (public_price >= 0),
  previous_price numeric(12,2) check (previous_price is null or previous_price >= public_price),
  condition text not null default 'Nuevo' check (condition in ('Nuevo','Reacondicionado','Usado seleccionado','Repuesto')),
  availability_label text not null default 'Consultar disponibilidad'
    check (availability_label in ('Disponible','Últimas unidades','Sin stock','Consultar disponibilidad')),
  primary_image_url text,
  specifications jsonb not null default '{}'::jsonb check (jsonb_typeof(specifications) = 'object'),
  warranty text not null default 'A confirmar',
  is_featured boolean not null default false,
  is_new boolean not null default false,
  is_offer boolean not null default false,
  shipping_enabled boolean not null default true,
  pickup_enabled boolean not null default true,
  is_published boolean not null default false,
  display_order integer not null default 1000,
  seo_title text,
  seo_description text,
  tags text[] not null default '{}',
  board_id uuid unique references public.tv_boards(id) on delete set null,
  board_code text,
  part_number text,
  board_type text,
  compatible_models text[] not null default '{}',
  board_notes text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Make upgrades from an earlier local draft safe without replacing reviewed data.
alter table public.storefront_products
  add column if not exists description_status text not null default 'pending_review',
  add column if not exists description_generated_at timestamptz,
  add column if not exists description_reviewed_at timestamptz;

do $$
begin
  if exists (
    select 1
    from public.storefront_products
    group by upper(btrim(sku))
    having count(*) > 1
  ) then
    raise exception 'Conflicto: storefront_products contiene SKU duplicados al normalizar mayúsculas y espacios.';
  end if;
end
$$;

-- sku remains original; normalization is only used to reject ambiguous duplicates.
create unique index if not exists storefront_products_sku_normalized_unique_idx
  on public.storefront_products ((upper(btrim(sku))));
create index if not exists storefront_products_published_order_idx
  on public.storefront_products (is_published, display_order, published_at desc);
create index if not exists storefront_products_category_idx
  on public.storefront_products (category_slug) where is_published;
create index if not exists storefront_products_board_code_idx
  on public.storefront_products (lower(replace(replace(coalesce(board_code,''),'-',''),' ',''))) where is_published;

create table if not exists public.storefront_product_images (
  id uuid primary key default gen_random_uuid(),
  storefront_product_id uuid not null references public.storefront_products(id) on delete cascade,
  storage_path text not null unique,
  public_url text not null,
  alt_text text not null,
  content_hash text,
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  sort_order integer not null default 0,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.storefront_product_images
  add column if not exists content_hash text;

create index if not exists storefront_product_images_product_order_idx
  on public.storefront_product_images (storefront_product_id, sort_order);
create unique index if not exists storefront_product_images_one_primary_idx
  on public.storefront_product_images (storefront_product_id) where is_primary;
create unique index if not exists storefront_product_images_hash_idx
  on public.storefront_product_images (content_hash) where content_hash is not null;

create table if not exists public.storefront_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  is_public boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.storefront_products enable row level security;
alter table public.storefront_product_images enable row level security;
alter table public.storefront_settings enable row level security;

drop policy if exists storefront_products_public_read on public.storefront_products;
drop policy if exists storefront_products_admin_select on public.storefront_products;
drop policy if exists storefront_products_admin_insert on public.storefront_products;
drop policy if exists storefront_products_admin_update on public.storefront_products;
drop policy if exists storefront_products_admin_delete on public.storefront_products;
create policy storefront_products_public_read on public.storefront_products
  for select to anon using (is_published and public_price > 0);
create policy storefront_products_admin_select on public.storefront_products
  for select to authenticated using ((select private.is_admin()));
create policy storefront_products_admin_insert on public.storefront_products
  for insert to authenticated with check ((select private.is_admin()));
create policy storefront_products_admin_update on public.storefront_products
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy storefront_products_admin_delete on public.storefront_products
  for delete to authenticated using ((select private.is_admin()));

drop policy if exists storefront_images_public_read on public.storefront_product_images;
drop policy if exists storefront_images_admin_all on public.storefront_product_images;
create policy storefront_images_public_read on public.storefront_product_images
  for select to anon
  using (exists (
    select 1 from public.storefront_products p
    where p.id = storefront_product_id and p.is_published and p.public_price > 0
  ));
create policy storefront_images_admin_all on public.storefront_product_images
  for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

drop policy if exists storefront_settings_public_read on public.storefront_settings;
drop policy if exists storefront_settings_admin_all on public.storefront_settings;
create policy storefront_settings_public_read on public.storefront_settings
  for select to anon using (is_public);
create policy storefront_settings_admin_all on public.storefront_settings
  for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

grant select on public.storefront_products, public.storefront_product_images, public.storefront_settings to anon, authenticated;
grant insert, update, delete on public.storefront_products, public.storefront_product_images, public.storefront_settings to authenticated;

create or replace function private.storefront_slugify(input text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    nullif(
      trim(both '-' from lower(regexp_replace(
        translate(coalesce(input, ''), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN'),
        '[^a-zA-Z0-9]+', '-', 'g'
      ))),
      ''
    ),
    'producto'
  );
$$;

create or replace function private.storefront_generated_description(product_name text, category_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select format(
    '%s pertenece a la categoría %s y fue incorporado al catálogo de Chetech. Consultanos para confirmar sus características, compatibilidad, contenido de la caja y disponibilidad antes de completar la compra.',
    btrim(coalesce(product_name, 'Este producto')),
    btrim(coalesce(nullif(category_name, ''), 'Otros'))
  );
$$;

create or replace function private.sync_storefront_product_from_source()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_category_name text;
  v_category_slug text;
  v_description text;
begin
  select coalesce(nullif(btrim(c.name), ''), 'Otros'),
         coalesce(nullif(btrim(c.slug), ''), 'otros')
    into v_category_name, v_category_slug
  from public.categories c
  where c.id = new.category_id;

  v_category_name := coalesce(v_category_name, 'Otros');
  v_category_slug := coalesce(v_category_slug, 'otros');

  if nullif(btrim(new.name), '') is not null
     and nullif(btrim(new.sku), '') is not null
     and new.sale_price > 0
     and new.stock > 0
     and new.is_active then
    v_description := private.storefront_generated_description(new.name, v_category_name);

    insert into public.storefront_products (
      product_id, slug, sku, name, short_description, description,
      description_status, description_generated_at,
      category_name, category_slug, public_price,
      availability_label, is_published, published_at
    ) values (
      new.id,
      private.storefront_slugify(new.name) || '-' || private.storefront_slugify(new.sku),
      new.sku,
      new.name,
      v_description,
      v_description,
      'generated',
      now(),
      v_category_name,
      v_category_slug,
      new.sale_price,
      case when new.stock <= greatest(new.min_stock, 1) then 'Últimas unidades' else 'Disponible' end,
      true,
      now()
    )
    on conflict (sku) do update set
      product_id = excluded.product_id,
      name = excluded.name,
      category_name = excluded.category_name,
      category_slug = excluded.category_slug,
      public_price = excluded.public_price,
      availability_label = excluded.availability_label,
      is_published = true,
      published_at = coalesce(public.storefront_products.published_at, excluded.published_at),
      short_description = case
        when public.storefront_products.description_status = 'manually_reviewed'
          then public.storefront_products.short_description
        else excluded.short_description
      end,
      description = case
        when public.storefront_products.description_status = 'manually_reviewed'
          then public.storefront_products.description
        else excluded.description
      end,
      description_status = case
        when public.storefront_products.description_status = 'manually_reviewed'
          then public.storefront_products.description_status
        else 'generated'
      end,
      description_generated_at = case
        when public.storefront_products.description_status = 'manually_reviewed'
          then public.storefront_products.description_generated_at
        else now()
      end,
      updated_at = now();
  else
    update public.storefront_products
    set availability_label = 'Sin stock',
        is_published = false,
        updated_at = now()
    where product_id = new.id;
  end if;

  return new;
end;
$$;

create or replace function private.sync_storefront_category_from_source()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.storefront_products sp
  set category_name = coalesce(nullif(btrim(new.name), ''), 'Otros'),
      category_slug = coalesce(nullif(btrim(new.slug), ''), 'otros'),
      updated_at = now()
  from public.products p
  where p.id = sp.product_id and p.category_id = new.id;
  return new;
end;
$$;

revoke all on function private.storefront_slugify(text) from public, anon, authenticated;
revoke all on function private.storefront_generated_description(text, text) from public, anon, authenticated;
revoke all on function private.sync_storefront_product_from_source() from public, anon, authenticated;
revoke all on function private.sync_storefront_category_from_source() from public, anon, authenticated;

drop trigger if exists sync_storefront_product_inventory_trigger on public.products;
drop trigger if exists sync_storefront_product_trigger on public.products;
create trigger sync_storefront_product_trigger
after insert or update of sku, name, category_id, sale_price, stock, min_stock, is_active
on public.products
for each row execute function private.sync_storefront_product_from_source();

drop trigger if exists sync_storefront_category_trigger on public.categories;
create trigger sync_storefront_category_trigger
after update of name, slug on public.categories
for each row execute function private.sync_storefront_category_from_source();

-- Idempotent initial migration. The conflict target is the existing commercial SKU.
insert into public.storefront_products (
  product_id, slug, sku, name, short_description, description,
  description_status, description_generated_at,
  category_name, category_slug, public_price,
  availability_label, is_published, published_at
)
select
  p.id,
  private.storefront_slugify(p.name) || '-' || private.storefront_slugify(p.sku),
  p.sku,
  p.name,
  private.storefront_generated_description(p.name, coalesce(c.name, 'Otros')),
  private.storefront_generated_description(p.name, coalesce(c.name, 'Otros')),
  'generated',
  now(),
  coalesce(nullif(btrim(c.name), ''), 'Otros'),
  coalesce(nullif(btrim(c.slug), ''), 'otros'),
  p.sale_price,
  case when p.stock <= greatest(p.min_stock, 1) then 'Últimas unidades' else 'Disponible' end,
  true,
  now()
from public.products p
left join public.categories c on c.id = p.category_id
where nullif(btrim(p.name), '') is not null
  and nullif(btrim(p.sku), '') is not null
  and p.sale_price > 0
  and p.stock > 0
  and p.is_active
on conflict (sku) do update set
  product_id = excluded.product_id,
  name = excluded.name,
  category_name = excluded.category_name,
  category_slug = excluded.category_slug,
  public_price = excluded.public_price,
  availability_label = excluded.availability_label,
  is_published = true,
  published_at = coalesce(public.storefront_products.published_at, excluded.published_at),
  short_description = case
    when public.storefront_products.description_status = 'manually_reviewed'
      then public.storefront_products.short_description
    else excluded.short_description
  end,
  description = case
    when public.storefront_products.description_status = 'manually_reviewed'
      then public.storefront_products.description
    else excluded.description
  end,
  description_status = case
    when public.storefront_products.description_status = 'manually_reviewed'
      then public.storefront_products.description_status
    else 'generated'
  end,
  description_generated_at = case
    when public.storefront_products.description_status = 'manually_reviewed'
      then public.storefront_products.description_generated_at
    else now()
  end,
  updated_at = now();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'storefront-products',
  'storefront-products',
  true,
  8388608,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists storefront_storage_admin_select on storage.objects;
drop policy if exists storefront_storage_admin_insert on storage.objects;
drop policy if exists storefront_storage_admin_update on storage.objects;
drop policy if exists storefront_storage_admin_delete on storage.objects;
create policy storefront_storage_admin_select on storage.objects
  for select to authenticated
  using (bucket_id = 'storefront-products' and (select private.is_admin()));
create policy storefront_storage_admin_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'storefront-products' and (select private.is_admin()));
create policy storefront_storage_admin_update on storage.objects
  for update to authenticated
  using (bucket_id = 'storefront-products' and (select private.is_admin()))
  with check (bucket_id = 'storefront-products' and (select private.is_admin()));
create policy storefront_storage_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'storefront-products' and (select private.is_admin()));
