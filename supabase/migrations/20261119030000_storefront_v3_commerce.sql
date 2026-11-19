-- Tienda v3: familias, compra sin cuenta, reservas de stock, pagos, cola de mails y medición.
--
-- Reglas de esta migración:
-- * Solo crea o amplía objetos de la tienda (storefront_*). De la gestión toca dos cosas, a propósito:
--   1. private.guard_reserved_stock: además de las reservas de reparaciones cuenta las reservas de
--      pedidos online, así el mostrador no vende la última unidad que ya está reservada.
--   2. private.storefront_sync_gestion_sale: cuando un pedido online se cobra, registra la venta
--      en la gestión con la misma lógica que public.save_sale_atomic (venta, ítems, pago, stock,
--      movimientos y auditoría). Así caja, stock y reportes siguen en un solo lugar.
-- * Todo lo que usa la tienda sin sesión pasa por funciones SECURITY DEFINER que solo puede
--   llamar service_role (el servidor de la tienda). Ningún dato privado queda expuesto a anon.
-- * Es idempotente: se puede volver a correr sin duplicar nada.

begin;

-- ---------------------------------------------------------------------------
-- 1. Familias del catálogo
-- ---------------------------------------------------------------------------

create table if not exists public.storefront_families (
  slug text primary key check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null,
  description text not null default '',
  sort_order integer not null default 100,
  warranty_months smallint check (warranty_months is null or warranty_months between 0 and 60),
  is_active boolean not null default true
);

insert into public.storefront_families (slug, name, description, sort_order) values
  ('para-tu-tele', 'Para tu tele', 'ONN, TV Stick, controles, soportes y cables HDMI.', 10),
  ('carga-y-energia', 'Carga y energía', 'Cargadores, cables, adaptadores, pilas y zapatillas.', 20),
  ('audio', 'Audio', 'Auriculares, parlantes y micrófonos.', 30),
  ('celular', 'Celular', 'Fundas, vidrios templados y soportes para auto.', 40),
  ('compu-y-gaming', 'Compu y gaming', 'Teclados, mouse, pendrives y joysticks.', 50),
  ('hogar', 'Hogar', 'Iluminación, freidoras, pavas, ventiladores y estufas.', 60),
  ('del-taller', 'Del taller', 'Teles revisadas y placas probadas en el banco de pruebas.', 70),
  ('otros', 'Otros', 'Productos que todavía no tienen familia asignada.', 999)
on conflict (slug) do nothing;

create table if not exists public.storefront_category_families (
  category_slug text primary key,
  family_slug text not null references public.storefront_families(slug) on update cascade
);

insert into public.storefront_category_families (category_slug, family_slug) values
  ('adaptadores', 'carga-y-energia'),
  ('cables', 'carga-y-energia'),
  ('cargadores', 'carga-y-energia'),
  ('pilas_y_baterias', 'carga-y-energia'),
  ('auriculares', 'audio'),
  ('parlantes', 'audio'),
  ('teclados_y_mouse', 'compu-y-gaming'),
  ('pendrives', 'compu-y-gaming'),
  ('freidoras', 'hogar'),
  ('iluminacion', 'hogar'),
  ('televisores', 'para-tu-tele'),
  ('varios', 'otros'),
  ('reparacion', 'otros'),
  ('vapers', 'otros')
on conflict (category_slug) do nothing;

alter table public.storefront_products
  add column if not exists family_override text
    references public.storefront_families(slug) on update cascade on delete set null,
  add column if not exists shipping_size text
    check (shipping_size is null or shipping_size in ('chico', 'mediano', 'grande', 'no_viaja')),
  add column if not exists warranty_months smallint
    check (warranty_months is null or warranty_months between 0 and 60),
  add column if not exists video_url text
    check (video_url is null or video_url ~ '^https://'),
  add column if not exists box_contents text not null default '',
  add column if not exists compatible_with text[] not null default '{}';

-- Reparto inicial de "Varios" y de los cables HDMI. Solo completa productos que todavía no tienen
-- familia elegida a mano, así se puede volver a correr sin pisar lo que se cargue en Administración.
with rules(pattern, family) as (
  values
    ('\m(onn|tv ?stick|control remoto|soporte (fijo |m[oó]vil )?(para )?tv|soporte tv|hdmi|televisor)', 'para-tu-tele'),
    ('\m(funda|vidrio templado|protector de c[aá]maras|soporte (gen[eé]rico|para auto|para celular)|soporte .*auto|grip)', 'celular'),
    ('\m(joystick|grips para joystick|game box|3d pen)', 'compu-y-gaming'),
    ('\m(zapatilla|estabilizador|adaptador multipuerto|prolongador)', 'carga-y-energia'),
    ('\m(radio|parlante|auricular|micr[oó]fono|video making kit)', 'audio'),
    ('\m(pava|caloventor|estufa|ventilador|minipimer|secador|sellador|linterna|freidora|l[aá]mpara)', 'hogar')
)
update public.storefront_products as product
set family_override = (
  select rules.family from rules where lower(product.name) ~ rules.pattern limit 1
)
where product.family_override is null
  and (product.category_slug = 'varios' or lower(product.name) ~ '\mhdmi')
  and exists (select 1 from rules where lower(product.name) ~ rules.pattern);

-- Tamaño de envío sugerido. Administración lo puede corregir producto por producto.
update public.storefront_products
set shipping_size = case
  when category_slug = 'televisores' or lower(name) ~ '\mtelevisor' then 'no_viaja'
  when category_slug = 'freidoras'
    or lower(name) ~ '\m(caloventor|estufa|ventilador|minipimer|pava|soporte (fijo|m[oó]vil)? ?(para )?tv)' then 'grande'
  when lower(name) ~ '\m(parlante|secador|radio|estabilizador|zapatilla|game box|joystick|teclado|onn|sellador)' then 'mediano'
  else 'chico'
end
where shipping_size is null;

-- ---------------------------------------------------------------------------
-- 2. Pedidos sin cuenta, pagos y estados nuevos
-- ---------------------------------------------------------------------------

alter table public.storefront_orders alter column user_id drop not null;

alter table public.storefront_orders
  add column if not exists access_token_hash text,
  add column if not exists payment_method text,
  add column if not exists payment_status text not null default 'pending',
  add column if not exists reserved_until timestamptz,
  add column if not exists paid_at timestamptz,
  add column if not exists ready_at timestamptz,
  add column if not exists shipped_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists expired_at timestamptz,
  add column if not exists pickup_code text,
  add column if not exists tracking_code text,
  add column if not exists tracking_url text,
  add column if not exists delivery_option jsonb,
  add column if not exists attribution jsonb not null default '{}'::jsonb,
  add column if not exists gestion_sale_id uuid references public.sales(id) on delete set null,
  add column if not exists transfer_reported_at timestamptz,
  add column if not exists marketing_consent boolean not null default false,
  add column if not exists discount_total numeric(14,2) not null default 0,
  add column if not exists needs_attention text;

alter table public.storefront_orders drop constraint if exists storefront_orders_status_check;
alter table public.storefront_orders add constraint storefront_orders_status_check check (status in (
  'pending_whatsapp', 'pending_confirmation', 'confirmed', 'awaiting_payment',
  'paid', 'preparing', 'shipped', 'ready_for_pickup', 'completed', 'cancelled',
  'expired', 'returned'
));

alter table public.storefront_orders drop constraint if exists storefront_orders_delivery_check;
alter table public.storefront_orders add constraint storefront_orders_delivery_check
  check (delivery_method in ('shipping', 'pickup', 'coordinate', 'local_delivery'));

alter table public.storefront_orders drop constraint if exists storefront_orders_amounts_check;
alter table public.storefront_orders add constraint storefront_orders_amounts_check check (
  subtotal >= 0 and shipping_cost >= 0 and discount_total >= 0
  and total = subtotal + shipping_cost - discount_total
);

alter table public.storefront_orders drop constraint if exists storefront_orders_payment_method_check;
alter table public.storefront_orders add constraint storefront_orders_payment_method_check
  check (payment_method is null or payment_method in ('mercadopago', 'transfer', 'pickup'));

alter table public.storefront_orders drop constraint if exists storefront_orders_payment_status_check;
alter table public.storefront_orders add constraint storefront_orders_payment_status_check
  check (payment_status in (
    'pending', 'in_process', 'approved', 'rejected', 'cancelled', 'refunded', 'charged_back'
  ));

alter table public.storefront_orders drop constraint if exists storefront_orders_owner_check;
alter table public.storefront_orders add constraint storefront_orders_owner_check
  check (user_id is not null or access_token_hash is not null);

create unique index if not exists storefront_orders_gestion_sale_idx
  on public.storefront_orders (gestion_sale_id) where gestion_sale_id is not null;
create index if not exists storefront_orders_awaiting_idx
  on public.storefront_orders (reserved_until) where status = 'awaiting_payment';
create index if not exists storefront_orders_email_idx
  on public.storefront_orders (lower(customer_email_snapshot));

alter table public.storefront_order_status_history
  drop constraint if exists storefront_order_history_previous_status_check;
alter table public.storefront_order_status_history
  add constraint storefront_order_history_previous_status_check check (previous_status is null or previous_status in (
    'pending_whatsapp', 'pending_confirmation', 'confirmed', 'awaiting_payment',
    'paid', 'preparing', 'shipped', 'ready_for_pickup', 'completed', 'cancelled',
    'expired', 'returned'
  ));
alter table public.storefront_order_status_history
  drop constraint if exists storefront_order_history_new_status_check;
alter table public.storefront_order_status_history
  add constraint storefront_order_history_new_status_check check (new_status in (
    'pending_whatsapp', 'pending_confirmation', 'confirmed', 'awaiting_payment',
    'paid', 'preparing', 'shipped', 'ready_for_pickup', 'completed', 'cancelled',
    'expired', 'returned'
  ));

-- ---------------------------------------------------------------------------
-- 3. Reservas de stock, pagos, avisos de pago, cola de mails, lista de aviso y visitas
-- ---------------------------------------------------------------------------

create table if not exists public.storefront_stock_reservations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.storefront_orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity integer not null check (quantity > 0),
  expires_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'consumed', 'released')),
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  unique (order_id, product_id)
);
create index if not exists storefront_stock_reservations_active_idx
  on public.storefront_stock_reservations (product_id) where status = 'active';

create table if not exists public.storefront_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.storefront_orders(id) on delete restrict,
  provider text not null check (provider in ('mercadopago', 'transfer', 'pickup')),
  provider_payment_id text,
  provider_preference_id text,
  status text not null,
  status_detail text,
  amount numeric(14,2) not null check (amount >= 0),
  currency text not null default 'ARS',
  confirmed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists storefront_payments_provider_id_idx
  on public.storefront_payments (provider, provider_payment_id) where provider_payment_id is not null;
create index if not exists storefront_payments_order_idx on public.storefront_payments (order_id);

create table if not exists public.storefront_webhook_events (
  id bigint generated always as identity primary key,
  provider text not null,
  event_key text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  result text,
  unique (provider, event_key)
);

create table if not exists public.storefront_outbox (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  order_id uuid references public.storefront_orders(id) on delete cascade,
  recipient text not null,
  dedupe_key text not null unique,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0,
  last_error text,
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists storefront_outbox_pending_idx
  on public.storefront_outbox (next_attempt_at) where status = 'pending';

create table if not exists public.storefront_waitlist (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('product', 'refurbished', 'board')),
  storefront_product_id uuid references public.storefront_products(id) on delete cascade,
  query text check (char_length(coalesce(query, '')) <= 200),
  contact_name text check (char_length(coalesce(contact_name, '')) <= 120),
  email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text check (phone is null or phone ~ '^[0-9+ ()-]{6,24}$'),
  consent boolean not null,
  created_at timestamptz not null default now(),
  notified_at timestamptz,
  check (email is not null or phone is not null),
  check (consent)
);

create table if not exists public.storefront_visit_stats (
  day date not null,
  source text not null,
  medium text not null,
  campaign text not null,
  content text not null,
  landing text not null,
  sessions integer not null default 0,
  primary key (day, source, medium, campaign, content, landing)
);

-- Ajustes. Nada se activa solo: cada medio de pago y de entrega arranca apagado hasta que se carguen
-- sus datos en Administración (alias, montos, zonas y tarifas).
insert into public.storefront_settings (key, value, is_public) values
  ('checkout', jsonb_build_object(
    'mercadopago', jsonb_build_object('enabled', false),
    'transfer', jsonb_build_object(
      'enabled', false, 'alias', '', 'cvu', '', 'holder', '', 'cuit', '', 'bank', ''),
    'pickup_payment', jsonb_build_object('enabled', false, 'max_amount', null),
    'mercadopago_reservation_minutes', 30,
    'offline_reservation_hours', 24,
    'sync_gestion_sales', true
  ), false),
  ('delivery', jsonb_build_object(
    'pickup', jsonb_build_object('enabled', true),
    'local', jsonb_build_object('enabled', false, 'zones', '[]'::jsonb),
    'correo', jsonb_build_object('enabled', false, 'rates',
      jsonb_build_object('chico', null, 'mediano', null, 'grande', null))
  ), false),
  ('promo', jsonb_build_object(
    'tv_channels', '[]'::jsonb,
    'reel_product_slug', null,
    'reel_title', ''
  ), true)
on conflict (key) do nothing;

alter table public.storefront_families enable row level security;
alter table public.storefront_category_families enable row level security;
alter table public.storefront_stock_reservations enable row level security;
alter table public.storefront_payments enable row level security;
alter table public.storefront_webhook_events enable row level security;
alter table public.storefront_outbox enable row level security;
alter table public.storefront_waitlist enable row level security;
alter table public.storefront_visit_stats enable row level security;

drop policy if exists storefront_families_public_read on public.storefront_families;
create policy storefront_families_public_read on public.storefront_families
  for select to anon, authenticated using (is_active);
drop policy if exists storefront_families_admin_all on public.storefront_families;
create policy storefront_families_admin_all on public.storefront_families
  for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
drop policy if exists storefront_category_families_admin_all on public.storefront_category_families;
create policy storefront_category_families_admin_all on public.storefront_category_families
  for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

do $$
declare t text;
begin
  foreach t in array array['storefront_stock_reservations', 'storefront_payments',
    'storefront_outbox', 'storefront_waitlist', 'storefront_visit_stats', 'storefront_webhook_events']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_admin_read', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select private.is_admin()))',
      t || '_admin_read', t);
  end loop;
end
$$;

revoke all on public.storefront_stock_reservations, public.storefront_payments,
  public.storefront_webhook_events, public.storefront_outbox, public.storefront_waitlist,
  public.storefront_visit_stats, public.storefront_category_families
  from public, anon;
grant select on public.storefront_families to anon, authenticated;
grant select, insert, update, delete on public.storefront_families, public.storefront_category_families
  to authenticated;
grant select on public.storefront_stock_reservations, public.storefront_payments,
  public.storefront_outbox, public.storefront_waitlist, public.storefront_visit_stats,
  public.storefront_webhook_events to authenticated;
grant all on public.storefront_families, public.storefront_category_families,
  public.storefront_stock_reservations, public.storefront_payments, public.storefront_webhook_events,
  public.storefront_outbox, public.storefront_waitlist, public.storefront_visit_stats to service_role;

-- ---------------------------------------------------------------------------
-- 4. Stock reservado: reparaciones + pedidos online
-- ---------------------------------------------------------------------------

create or replace function private.storefront_reserved_quantity(p_product_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(quantity), 0)::integer
  from public.storefront_stock_reservations
  where product_id = p_product_id
    and status = 'active'
    and expires_at > now();
$$;
revoke all on function private.storefront_reserved_quantity(uuid) from public, anon, authenticated;

create or replace function private.guard_reserved_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_repairs integer;
  v_online integer;
begin
  select coalesce(sum(reserved_quantity), 0) into v_repairs
  from public.repair_part_requests where product_id = new.id;
  v_online := private.storefront_reserved_quantity(new.id);
  if new.stock < v_repairs + v_online then
    if v_online > 0 then
      raise exception 'Hay % unidades reservadas (% para reparaciones y % para pedidos online). Libera la reserva antes de vender o reducir el stock.',
        v_repairs + v_online, v_repairs, v_online using errcode = '23514';
    end if;
    raise exception 'Hay % unidades reservadas para reparaciones. Libera la reserva antes de vender o reducir el stock.',
      v_repairs using errcode = '23514';
  end if;
  return new;
end
$$;

-- ---------------------------------------------------------------------------
-- 5. Catálogo público v3: un solo pedido trae todo lo publicable, con familia, popularidad,
--    garantía efectiva y disponibilidad real (stock menos reservas). Nunca expone stock ni costos.
-- ---------------------------------------------------------------------------

create or replace function public.get_storefront_products_v3()
returns setof jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with sold as (
    select item.product_id, sum(item.quantity)::integer as units
    from public.sale_items as item
    join public.sales as sale on sale.id = item.sale_id
    where sale.sold_at > now() - interval '90 days'
      and item.product_id is not null
    group by item.product_id
  ),
  ranked as (
    select product_id, row_number() over (order by units desc, product_id) as rank
    from sold
  ),
  images as (
    select storefront_product_id,
      jsonb_agg(public_url order by is_primary desc, sort_order, created_at) as urls
    from public.storefront_product_images
    group by storefront_product_id
  ),
  reserved as (
    select r.product_id, sum(r.quantity)::integer as quantity
    from (
      select product_id, quantity from public.storefront_stock_reservations
      where status = 'active' and expires_at > now()
      union all
      select product_id, reserved_quantity from public.repair_part_requests
      where product_id is not null and reserved_quantity > 0
    ) as r
    group by r.product_id
  )
  select jsonb_build_object(
    'id', sp.id,
    'slug', sp.slug,
    'sku', sp.sku,
    'name', sp.name,
    'short_description', sp.short_description,
    'description', sp.description,
    'category_name', sp.category_name,
    'category_slug', sp.category_slug,
    'family_slug', family.slug,
    'family_name', family.name,
    'brand', sp.brand,
    'model', sp.model,
    'public_price', sp.public_price,
    'previous_price', sp.previous_price,
    'condition', sp.condition,
    'availability_label', case
      when source.stock - coalesce(reserved.quantity, 0) <= 0 then 'Sin stock'
      when source.stock - coalesce(reserved.quantity, 0) <= greatest(source.min_stock, 1)
        then 'Últimas unidades'
      else 'Disponible'
    end,
    'primary_image_url', coalesce(sp.primary_image_url, images.urls ->> 0),
    'image_urls', coalesce(images.urls, '[]'::jsonb),
    'specifications', sp.specifications,
    'warranty_months', coalesce(
      sp.warranty_months,
      family.warranty_months,
      case when sp.condition = 'Nuevo' then 6 else 3 end
    ),
    'warranty_is_legal_minimum', sp.warranty_months is null and family.warranty_months is null,
    'is_featured', sp.is_featured,
    'is_new', sp.is_new,
    'is_offer', sp.is_offer,
    'shipping_enabled', sp.shipping_enabled,
    'pickup_enabled', sp.pickup_enabled,
    'shipping_size', sp.shipping_size,
    'video_url', sp.video_url,
    'box_contents', sp.box_contents,
    'compatible_with', sp.compatible_with,
    'board_code', sp.board_code,
    'part_number', sp.part_number,
    'board_type', sp.board_type,
    'compatible_models', sp.compatible_models,
    'popularity_rank', ranked.rank,
    'published_at', sp.published_at,
    'display_order', sp.display_order
  )
  from public.storefront_products as sp
  join public.products as source on source.id = sp.product_id
  left join public.storefront_category_families as mapping on mapping.category_slug = sp.category_slug
  join public.storefront_families as family
    on family.slug = coalesce(sp.family_override, mapping.family_slug, 'otros')
  left join ranked on ranked.product_id = sp.product_id
  left join images on images.storefront_product_id = sp.id
  left join reserved on reserved.product_id = sp.product_id
  where sp.is_published
    and sp.archived_at is null
    and sp.public_price > 0
    and source.is_active
  order by sp.display_order, sp.published_at desc nulls last;
$$;

revoke all on function public.get_storefront_products_v3() from public;
grant execute on function public.get_storefront_products_v3() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Utilidades privadas
-- ---------------------------------------------------------------------------

create or replace function private.storefront_setting(p_key text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select value from public.storefront_settings where key = p_key), '{}'::jsonb);
$$;
revoke all on function private.storefront_setting(text) from public, anon, authenticated;

create or replace function private.storefront_order_history(
  p_order_id uuid, p_previous text, p_new text, p_actor uuid, p_note text
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.storefront_order_status_history (
    order_id, previous_status, new_status, changed_by, customer_visible_note
  ) values (p_order_id, p_previous, p_new, p_actor, nullif(left(p_note, 1000), ''));
$$;
revoke all on function private.storefront_order_history(uuid, text, text, uuid, text)
  from public, anon, authenticated;

create or replace function private.storefront_enqueue_mail(
  p_kind text, p_order_id uuid, p_recipient text, p_dedupe text, p_payload jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.storefront_outbox (kind, order_id, recipient, dedupe_key, payload)
  select p_kind, p_order_id, p_recipient, p_dedupe, coalesce(p_payload, '{}'::jsonb)
  where nullif(btrim(p_recipient), '') is not null
  on conflict (dedupe_key) do nothing;
$$;
revoke all on function private.storefront_enqueue_mail(text, uuid, text, text, jsonb)
  from public, anon, authenticated;

-- Horas hábiles: lunes a sábado. Una reserva de 24 h que cae en domingo se corre un día.
create or replace function private.storefront_offline_deadline(p_hours integer)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  v_deadline timestamptz := now() + make_interval(hours => greatest(coalesce(p_hours, 24), 1));
begin
  if extract(isodow from v_deadline at time zone 'America/Argentina/Cordoba') = 7 then
    v_deadline := v_deadline + interval '1 day';
  end if;
  return v_deadline;
end
$$;
revoke all on function private.storefront_offline_deadline(integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. Crear pedido (con o sin cuenta). Lo llama solo el servidor de la tienda.
--    Precios, envío y disponibilidad salen de la base; el navegador solo elige productos y cantidades.
-- ---------------------------------------------------------------------------

create or replace function private.storefront_create_checkout(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_checkout jsonb := private.storefront_setting('checkout');
  v_delivery_settings jsonb := private.storefront_setting('delivery');
  v_items jsonb := p_input -> 'items';
  v_customer jsonb := coalesce(p_input -> 'customer', '{}'::jsonb);
  v_delivery jsonb := coalesce(p_input -> 'delivery', '{}'::jsonb);
  v_payment text := p_input ->> 'payment_method';
  v_kind text := coalesce(v_delivery ->> 'kind', 'pickup');
  v_name text := btrim(coalesce(v_customer ->> 'name', ''));
  v_email text := lower(btrim(coalesce(v_customer ->> 'email', '')));
  v_phone text := regexp_replace(coalesce(v_customer ->> 'phone', ''), '[^0-9+]', '', 'g');
  v_user uuid := nullif(p_input ->> 'user_id', '')::uuid;
  v_token_hash text := nullif(p_input ->> 'access_token_hash', '');
  v_subtotal numeric(14,2) := 0;
  v_shipping numeric(14,2) := 0;
  v_total numeric(14,2);
  v_reserved_until timestamptz;
  v_order_id uuid;
  v_order_number text;
  v_line record;
  v_available integer;
  v_size_rank integer := 0;
  v_zone jsonb;
  v_rate numeric;
  v_delivery_method text;
  v_address jsonb;
  v_option jsonb;
begin
  if v_items is null or jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
    raise exception 'El carrito está vacío.' using errcode = '22023';
  end if;
  if jsonb_array_length(v_items) > 30 then
    raise exception 'El pedido tiene demasiados productos distintos.' using errcode = '22023';
  end if;
  if char_length(v_name) < 3 or char_length(v_name) > 120 then
    raise exception 'Revisá tu nombre.' using errcode = '22023';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254 then
    raise exception 'Revisá tu mail.' using errcode = '22023';
  end if;
  if char_length(v_phone) < 8 or char_length(v_phone) > 20 then
    raise exception 'Revisá tu WhatsApp.' using errcode = '22023';
  end if;
  if v_user is null and v_token_hash is null then
    raise exception 'Falta la clave de acceso al pedido.' using errcode = '22023';
  end if;

  -- Medio de pago habilitado
  if v_payment = 'mercadopago' then
    if not coalesce((v_checkout #>> '{mercadopago,enabled}')::boolean, false) then
      raise exception 'Mercado Pago todavía no está habilitado.' using errcode = '22023';
    end if;
    v_reserved_until := now() + make_interval(
      mins => greatest(coalesce((v_checkout ->> 'mercadopago_reservation_minutes')::integer, 30), 10));
  elsif v_payment = 'transfer' then
    if not coalesce((v_checkout #>> '{transfer,enabled}')::boolean, false)
       or coalesce(v_checkout #>> '{transfer,alias}', '') = '' and coalesce(v_checkout #>> '{transfer,cvu}', '') = '' then
      raise exception 'La transferencia todavía no está habilitada.' using errcode = '22023';
    end if;
    v_reserved_until := private.storefront_offline_deadline(
      (v_checkout ->> 'offline_reservation_hours')::integer);
  elsif v_payment = 'pickup' then
    if not coalesce((v_checkout #>> '{pickup_payment,enabled}')::boolean, false) then
      raise exception 'El pago al retirar todavía no está habilitado.' using errcode = '22023';
    end if;
    if v_kind <> 'pickup' then
      raise exception 'El pago al retirar es solo con retiro en el local.' using errcode = '22023';
    end if;
    v_reserved_until := private.storefront_offline_deadline(
      (v_checkout ->> 'offline_reservation_hours')::integer);
  else
    raise exception 'Elegí un medio de pago.' using errcode = '22023';
  end if;

  -- Bloqueo de productos en orden estable para evitar bloqueos cruzados
  perform 1
  from public.products as product
  where product.id in (
    select sp.product_id
    from jsonb_array_elements(v_items) as item
    join public.storefront_products as sp on sp.id = (item ->> 'storefront_product_id')::uuid
  )
  order by product.id
  for update;

  for v_line in
    select
      sp.id as storefront_product_id,
      sp.product_id,
      sp.sku,
      sp.name,
      sp.public_price,
      sp.primary_image_url,
      sp.shipping_size,
      sp.is_published,
      sp.archived_at,
      sp.shipping_enabled,
      sp.pickup_enabled,
      source.stock,
      source.is_active,
      requested.quantity
    from (
      select (item ->> 'storefront_product_id')::uuid as id,
        sum((item ->> 'quantity')::integer)::integer as quantity
      from jsonb_array_elements(v_items) as item
      group by 1
    ) as requested
    left join public.storefront_products as sp on sp.id = requested.id
    left join public.products as source on source.id = sp.product_id
  loop
    if v_line.storefront_product_id is null or not v_line.is_published
       or v_line.archived_at is not null or not v_line.is_active or v_line.public_price <= 0 then
      raise exception 'Un producto del carrito ya no está disponible.' using errcode = 'P0002';
    end if;
    if v_line.quantity < 1 or v_line.quantity > 10 then
      raise exception 'La cantidad de % tiene que ser entre 1 y 10.', v_line.name using errcode = '22023';
    end if;
    select coalesce(sum(reserved_quantity), 0) into v_available
    from public.repair_part_requests where product_id = v_line.product_id;
    v_available := v_line.stock - v_available - private.storefront_reserved_quantity(v_line.product_id);
    if v_available < v_line.quantity then
      if v_available <= 0 then
        raise exception 'Se agotó %.', v_line.name using errcode = '23514';
      end if;
      raise exception 'De % quedan % unidades.', v_line.name, v_available using errcode = '23514';
    end if;
    if v_kind = 'shipping' and (v_line.shipping_size = 'no_viaja' or not v_line.shipping_enabled) then
      raise exception '% no se envía por correo. Elegí retiro o entrega en la zona.', v_line.name
        using errcode = '22023';
    end if;
    v_subtotal := v_subtotal + v_line.public_price * v_line.quantity;
    v_size_rank := greatest(v_size_rank, case coalesce(v_line.shipping_size, 'chico')
      when 'chico' then 1 when 'mediano' then 2 when 'grande' then 3 else 4 end);
  end loop;

  -- Entrega
  if v_kind = 'pickup' then
    if not coalesce((v_delivery_settings #>> '{pickup,enabled}')::boolean, true) then
      raise exception 'El retiro en el local no está disponible.' using errcode = '22023';
    end if;
    v_delivery_method := 'pickup';
    v_option := jsonb_build_object('kind', 'pickup', 'label', 'Retiro en Independencia 784');
  elsif v_kind = 'local' then
    if not coalesce((v_delivery_settings #>> '{local,enabled}')::boolean, false) then
      raise exception 'La entrega en la zona todavía no está disponible.' using errcode = '22023';
    end if;
    select z.value into v_zone
    from jsonb_array_elements(coalesce(v_delivery_settings #> '{local,zones}', '[]'::jsonb)) as z(value)
    where z.value ->> 'id' = v_delivery ->> 'zone'
    limit 1;
    if v_zone is null then
      raise exception 'Elegí una zona de entrega.' using errcode = '22023';
    end if;
    v_shipping := coalesce((v_zone ->> 'price')::numeric, 0);
    v_delivery_method := 'local_delivery';
    v_option := jsonb_build_object('kind', 'local', 'zone', v_zone ->> 'id',
      'label', 'Entrega CheTech · ' || coalesce(v_zone ->> 'name', ''));
  elsif v_kind = 'shipping' then
    if not coalesce((v_delivery_settings #>> '{correo,enabled}')::boolean, false) then
      raise exception 'Los envíos por correo todavía no están disponibles.' using errcode = '22023';
    end if;
    v_rate := (v_delivery_settings #>> array['correo', 'rates',
      case v_size_rank when 1 then 'chico' when 2 then 'mediano' else 'grande' end])::numeric;
    if v_rate is null then
      raise exception 'Todavía no hay tarifa de correo para este tamaño de paquete.' using errcode = '22023';
    end if;
    v_shipping := v_rate;
    v_delivery_method := 'shipping';
    v_option := jsonb_build_object('kind', 'shipping', 'service', coalesce(v_delivery ->> 'service', 'home'),
      'label', 'Correo Argentino');
  else
    raise exception 'Elegí cómo recibir el pedido.' using errcode = '22023';
  end if;

  if v_kind in ('local', 'shipping') then
    v_address := jsonb_build_object(
      'street', left(btrim(coalesce(v_delivery #>> '{address,street}', '')), 120),
      'number', left(btrim(coalesce(v_delivery #>> '{address,number}', '')), 20),
      'apartment', left(btrim(coalesce(v_delivery #>> '{address,apartment}', '')), 40),
      'city', left(btrim(coalesce(v_delivery #>> '{address,city}', '')), 80),
      'province', left(btrim(coalesce(v_delivery #>> '{address,province}', 'Córdoba')), 80),
      'postal_code', left(btrim(coalesce(v_delivery #>> '{address,postal_code}', '')), 10),
      'notes', left(btrim(coalesce(v_delivery #>> '{address,notes}', '')), 300)
    );
    if v_address ->> 'street' = '' or v_address ->> 'city' = '' or v_address ->> 'postal_code' !~ '^[A-Za-z]?[0-9]{4}[A-Za-z]{0,3}$' then
      raise exception 'Completá la dirección de entrega.' using errcode = '22023';
    end if;
  end if;

  v_total := v_subtotal + v_shipping;

  if v_payment = 'pickup' then
    if (v_checkout #>> '{pickup_payment,max_amount}') is not null
       and v_total > (v_checkout #>> '{pickup_payment,max_amount}')::numeric then
      raise exception 'El pago al retirar es para pedidos de hasta $ %.',
        to_char((v_checkout #>> '{pickup_payment,max_amount}')::numeric, 'FM999G999G999')
        using errcode = '22023';
    end if;
  end if;

  v_order_number := 'CHT-' || lpad(nextval('private.storefront_order_number_seq')::text, 6, '0');

  insert into public.storefront_orders (
    order_number, user_id, status, delivery_method, shipping_address_snapshot,
    customer_name_snapshot, customer_email_snapshot, customer_phone_snapshot,
    subtotal, shipping_cost, total, customer_notes, source,
    access_token_hash, payment_method, payment_status, reserved_until,
    delivery_option, attribution, marketing_consent
  ) values (
    v_order_number, v_user, 'awaiting_payment', v_delivery_method, v_address,
    v_name, v_email, v_phone,
    v_subtotal, v_shipping, v_total,
    nullif(left(btrim(coalesce(p_input ->> 'notes', '')), 1000), ''),
    'storefront_checkout',
    v_token_hash, v_payment, 'pending', v_reserved_until,
    v_option,
    coalesce(p_input -> 'attribution', '{}'::jsonb),
    coalesce((p_input ->> 'marketing_consent')::boolean, false)
  ) returning id into v_order_id;

  insert into public.storefront_order_items (
    order_id, storefront_product_id, product_id, sku_snapshot, product_name_snapshot,
    unit_price_snapshot, quantity, subtotal, product_image_snapshot
  )
  select v_order_id, sp.id, sp.product_id, sp.sku, sp.name, sp.public_price,
    requested.quantity, sp.public_price * requested.quantity, sp.primary_image_url
  from (
    select (item ->> 'storefront_product_id')::uuid as id,
      sum((item ->> 'quantity')::integer)::integer as quantity
    from jsonb_array_elements(v_items) as item
    group by 1
  ) as requested
  join public.storefront_products as sp on sp.id = requested.id;

  insert into public.storefront_stock_reservations (order_id, product_id, quantity, expires_at)
  select v_order_id, item.product_id, sum(item.quantity), v_reserved_until
  from public.storefront_order_items as item
  where item.order_id = v_order_id
  group by item.product_id;

  perform private.storefront_order_history(v_order_id, null, 'awaiting_payment', v_user,
    case v_payment
      when 'mercadopago' then 'Pedido recibido. Esperando el pago con Mercado Pago.'
      when 'transfer' then 'Pedido recibido. Esperando la transferencia.'
      else 'Pedido recibido. Se paga al retirar.'
    end);

  if v_payment in ('transfer', 'pickup') then
    perform private.storefront_enqueue_mail(
      case v_payment when 'transfer' then 'transfer_instructions' else 'order_received' end,
      v_order_id, v_email, v_order_id::text || ':received', '{}'::jsonb);
  end if;
  perform private.storefront_enqueue_mail('admin_new_order', v_order_id, '__admin__',
    v_order_id::text || ':admin', '{}'::jsonb);

  return jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'subtotal', v_subtotal,
    'shipping_cost', v_shipping,
    'total', v_total,
    'payment_method', v_payment,
    'reserved_until', v_reserved_until
  );
end
$$;
revoke all on function private.storefront_create_checkout(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. Venta en la gestión al cobrar un pedido online (misma lógica que save_sale_atomic)
-- ---------------------------------------------------------------------------

create or replace function private.storefront_sync_gestion_sale(
  p_order_id uuid, p_method text, p_actor uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.storefront_orders%rowtype;
  v_sale_id uuid;
  v_sale_number text;
  v_subtotal numeric(12,2);
  v_cost numeric(12,2);
  v_note text;
  v_short text;
begin
  select * into v_order from public.storefront_orders where id = p_order_id for update;
  if not found then
    raise exception 'No se encontró el pedido.' using errcode = 'P0002';
  end if;
  if v_order.gestion_sale_id is not null then
    return v_order.gestion_sale_id;
  end if;
  if p_method not in ('efectivo', 'nx', 'mp', 'transferencia', 'otro') then
    raise exception 'Medio de pago inválido para la gestión.' using errcode = '22023';
  end if;

  -- La reserva se consume antes de bajar el stock, así el control de reservas no frena la venta.
  update public.storefront_stock_reservations
  set status = 'consumed', closed_at = now()
  where order_id = p_order_id and status = 'active';

  perform 1 from public.products
  where id in (select product_id from public.storefront_order_items where order_id = p_order_id)
  order by id
  for update;

  if exists (
    select 1
    from (
      select product_id, sum(quantity)::integer as quantity
      from public.storefront_order_items
      where order_id = p_order_id and product_id is not null
      group by product_id
    ) as requested
    join public.products as product on product.id = requested.product_id
    where product.stock < requested.quantity
  ) then
    raise exception 'No alcanza el stock para registrar la venta del pedido %.', v_order.order_number
      using errcode = '23514';
  end if;

  v_subtotal := v_order.subtotal - v_order.discount_total;
  select coalesce(sum(item.quantity * product.cost), 0)
  into v_cost
  from public.storefront_order_items as item
  join public.products as product on product.id = item.product_id
  where item.order_id = p_order_id;

  v_short := 'Pedido online ' || v_order.order_number;
  v_note := v_short || ' · ' || v_order.customer_name_snapshot
    || case when v_order.shipping_cost > 0
      then ' · envío $ ' || to_char(v_order.shipping_cost, 'FM999G999G999') || ' fuera de la venta'
      else '' end;
  v_sale_number := public.generate_sale_number();

  insert into public.sales (sale_number, subtotal, cost_total, profit_total, notes, sold_at, created_by)
  values (v_sale_number, v_subtotal, v_cost, v_subtotal - v_cost, v_note, now(), p_actor)
  returning id into v_sale_id;

  insert into public.sale_items (sale_id, product_id, quantity, unit_price, unit_cost, total, description)
  select v_sale_id, item.product_id, item.quantity, item.unit_price_snapshot, product.cost,
    item.subtotal, item.product_name_snapshot
  from public.storefront_order_items as item
  left join public.products as product on product.id = item.product_id
  where item.order_id = p_order_id;

  insert into public.sale_payments (sale_id, method, amount)
  values (v_sale_id, p_method, v_subtotal);

  update public.products as product
  set stock = product.stock - requested.quantity
  from (
    select product_id, sum(quantity)::integer as quantity
    from public.storefront_order_items
    where order_id = p_order_id and product_id is not null
    group by product_id
  ) as requested
  where product.id = requested.product_id;

  insert into public.stock_movements (product_id, movement_type, quantity, reference_id, notes)
  select item.product_id, 'sale', -item.quantity, v_sale_id, v_short
  from public.storefront_order_items as item
  where item.order_id = p_order_id and item.product_id is not null;

  insert into public.movimientos_stock (
    producto_id, tipo, cantidad, descripcion, referencia_tabla, referencia_id, created_by
  )
  select item.product_id, 'salida', item.quantity, v_short, 'sales', v_sale_id, p_actor
  from public.storefront_order_items as item
  where item.order_id = p_order_id and item.product_id is not null;

  insert into public.movimientos_caja (
    tipo, monto, medio_pago, descripcion, referencia_tabla, referencia_id, created_by, fecha
  ) values (
    'venta', v_subtotal, p_method, 'Venta ' || v_sale_number || ' · ' || v_short,
    'sales', v_sale_id, p_actor, now()
  );

  insert into public.audit_logs (entity_type, entity_id, action, changes, user_id)
  values ('sales', v_sale_id::text, 'insert', jsonb_build_object(
    'sale_number', v_sale_number,
    'subtotal', v_subtotal,
    'cost_total', v_cost,
    'profit_total', v_subtotal - v_cost,
    'origin', 'storefront',
    'storefront_order', v_order.order_number,
    'payment_method', p_method
  ), p_actor);

  update public.storefront_orders set gestion_sale_id = v_sale_id, updated_at = now()
  where id = p_order_id;

  return v_sale_id;
end
$$;
revoke all on function private.storefront_sync_gestion_sale(uuid, text, uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 9. Aplicar un pago (Mercado Pago, transferencia confirmada o cobro al retirar)
-- ---------------------------------------------------------------------------

create or replace function private.storefront_apply_payment(
  p_order_id uuid,
  p_provider text,
  p_provider_payment_id text,
  p_status text,
  p_status_detail text,
  p_amount numeric,
  p_currency text,
  p_actor uuid,
  p_gestion_method text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.storefront_orders%rowtype;
  v_checkout jsonb := private.storefront_setting('checkout');
  v_new_status text;
  v_line record;
  v_available integer;
  v_short boolean := false;
  v_method text := coalesce(p_gestion_method,
    case p_provider when 'mercadopago' then 'mp' when 'transfer' then 'transferencia' else 'otro' end);
begin
  select * into v_order from public.storefront_orders where id = p_order_id for update;
  if not found then
    raise exception 'No se encontró el pedido.' using errcode = 'P0002';
  end if;

  if p_provider_payment_id is not null then
    insert into public.storefront_payments (
      order_id, provider, provider_payment_id, status, status_detail, amount, currency, confirmed_by
    ) values (
      p_order_id, p_provider, p_provider_payment_id, p_status, p_status_detail,
      coalesce(p_amount, 0), coalesce(p_currency, 'ARS'), p_actor
    )
    on conflict (provider, provider_payment_id) where provider_payment_id is not null
    do update set status = excluded.status, status_detail = excluded.status_detail,
      amount = excluded.amount, updated_at = now();
  else
    insert into public.storefront_payments (
      order_id, provider, status, status_detail, amount, currency, confirmed_by
    ) values (
      p_order_id, p_provider, p_status, p_status_detail, coalesce(p_amount, 0),
      coalesce(p_currency, 'ARS'), p_actor
    );
  end if;

  if p_status <> 'approved' then
    if v_order.payment_status not in ('approved', 'refunded', 'charged_back') then
      update public.storefront_orders
      set payment_status = case
            when p_status in ('pending', 'in_process', 'rejected', 'cancelled') then p_status
            else v_order.payment_status end,
          updated_at = now()
      where id = p_order_id;
    elsif p_status in ('refunded', 'charged_back') then
      update public.storefront_orders
      set payment_status = p_status,
          needs_attention = 'El pago figura ' || case p_status when 'refunded' then 'devuelto'
            else 'con contracargo' end || ' en Mercado Pago. Revisá la venta en la gestión.',
          updated_at = now()
      where id = p_order_id;
    end if;
    return jsonb_build_object('order_id', p_order_id, 'applied', false, 'status', v_order.status);
  end if;

  if v_order.payment_status = 'approved' then
    return jsonb_build_object('order_id', p_order_id, 'applied', false, 'status', v_order.status);
  end if;

  if abs(coalesce(p_amount, 0) - v_order.total) > 0.01 or coalesce(p_currency, 'ARS') <> 'ARS' then
    update public.storefront_orders
    set needs_attention = 'El monto cobrado ($ ' || coalesce(p_amount, 0)::text
          || ') no coincide con el total del pedido.',
        payment_status = 'in_process', updated_at = now()
    where id = p_order_id;
    return jsonb_build_object('order_id', p_order_id, 'applied', false, 'status', v_order.status,
      'reason', 'amount_mismatch');
  end if;

  -- Pago que llegó después del vencimiento: si todavía hay stock se reserva de nuevo y sigue.
  if v_order.status in ('expired', 'cancelled') then
    perform 1 from public.products
    where id in (select product_id from public.storefront_order_items where order_id = p_order_id)
    order by id for update;
    for v_line in
      select product_id, sum(quantity)::integer as quantity
      from public.storefront_order_items
      where order_id = p_order_id and product_id is not null
      group by product_id
    loop
      select product.stock - coalesce((select sum(reserved_quantity) from public.repair_part_requests
          where product_id = v_line.product_id), 0) - private.storefront_reserved_quantity(v_line.product_id)
      into v_available
      from public.products as product where product.id = v_line.product_id;
      if coalesce(v_available, 0) < v_line.quantity then
        v_short := true;
      end if;
    end loop;
    if v_short then
      update public.storefront_orders
      set payment_status = 'approved', paid_at = now(),
          needs_attention = 'Se cobró después de vencer la reserva y ya no hay stock. Hay que devolver el pago.',
          updated_at = now()
      where id = p_order_id;
      perform private.storefront_order_history(p_order_id, v_order.status, v_order.status, p_actor,
        'Recibimos el pago, pero el producto se agotó. Te vamos a devolver el dinero.');
      perform private.storefront_enqueue_mail('admin_attention', p_order_id, '__admin__',
        p_order_id::text || ':late-payment', '{}'::jsonb);
      return jsonb_build_object('order_id', p_order_id, 'applied', false, 'reason', 'late_no_stock');
    end if;
    update public.storefront_stock_reservations
    set status = 'active', expires_at = now() + interval '1 hour', closed_at = null
    where order_id = p_order_id;
  end if;

  v_new_status := case when v_order.payment_method = 'pickup' and v_order.status = 'ready_for_pickup'
    then 'completed' else 'paid' end;

  if coalesce((v_checkout ->> 'sync_gestion_sales')::boolean, true) then
    perform private.storefront_sync_gestion_sale(p_order_id, v_method, p_actor);
  else
    update public.storefront_stock_reservations
    set status = 'consumed', closed_at = now()
    where order_id = p_order_id and status = 'active';
  end if;

  update public.storefront_orders
  set status = v_new_status,
      payment_status = 'approved',
      paid_at = now(),
      delivered_at = case when v_new_status = 'completed' then now() else delivered_at end,
      confirmed_at = coalesce(confirmed_at, now()),
      updated_at = now()
  where id = p_order_id;

  perform private.storefront_order_history(p_order_id, v_order.status, v_new_status, p_actor,
    case when v_new_status = 'completed' then 'Pedido cobrado y entregado.'
      else 'Pago confirmado. Preparamos tu pedido.' end);

  if v_new_status = 'paid' then
    perform private.storefront_enqueue_mail('payment_confirmed', p_order_id,
      v_order.customer_email_snapshot, p_order_id::text || ':paid', '{}'::jsonb);
  end if;

  return jsonb_build_object('order_id', p_order_id, 'applied', true, 'status', v_new_status);
end
$$;
revoke all on function private.storefront_apply_payment(uuid, text, text, text, text, numeric, text, uuid, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 10. Vencimientos y recordatorios (pg_cron cada 5 minutos si está disponible)
-- ---------------------------------------------------------------------------

create or replace function private.storefront_expire_orders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_count integer := 0;
begin
  for v_order in
    select id, status, payment_method, customer_email_snapshot
    from public.storefront_orders
    where status = 'awaiting_payment' and reserved_until < now()
    order by reserved_until
    limit 200
    for update skip locked
  loop
    update public.storefront_stock_reservations
    set status = 'released', closed_at = now()
    where order_id = v_order.id and status = 'active';
    update public.storefront_orders
    set status = 'expired', expired_at = now(), updated_at = now()
    where id = v_order.id;
    perform private.storefront_order_history(v_order.id, v_order.status, 'expired', null,
      'La reserva venció sin pago y el stock volvió a estar disponible.');
    perform private.storefront_enqueue_mail('order_expired', v_order.id,
      v_order.customer_email_snapshot, v_order.id::text || ':expired', '{}'::jsonb);
    v_count := v_count + 1;
  end loop;

  -- Recordatorio 3 horas antes de vencer (transferencia y pago al retirar)
  insert into public.storefront_outbox (kind, order_id, recipient, dedupe_key)
  select 'reservation_reminder', o.id, o.customer_email_snapshot, o.id::text || ':reminder'
  from public.storefront_orders as o
  where o.status = 'awaiting_payment'
    and o.payment_method in ('transfer', 'pickup')
    and o.transfer_reported_at is null
    and o.reserved_until between now() and now() + interval '3 hours'
  on conflict (dedupe_key) do nothing;

  return v_count;
end
$$;
revoke all on function private.storefront_expire_orders() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 11. Acceso del cliente a su pedido y aviso de transferencia
-- ---------------------------------------------------------------------------

create or replace function private.storefront_order_payload(p_order_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', o.id,
    'order_number', o.order_number,
    'status', o.status,
    'payment_method', o.payment_method,
    'payment_status', o.payment_status,
    'delivery_method', o.delivery_method,
    'delivery_option', o.delivery_option,
    'shipping_address', o.shipping_address_snapshot,
    'customer_name', o.customer_name_snapshot,
    'customer_email', o.customer_email_snapshot,
    'customer_phone', o.customer_phone_snapshot,
    'subtotal', o.subtotal,
    'shipping_cost', o.shipping_cost,
    'discount_total', o.discount_total,
    'total', o.total,
    'reserved_until', o.reserved_until,
    'paid_at', o.paid_at,
    'ready_at', o.ready_at,
    'shipped_at', o.shipped_at,
    'delivered_at', o.delivered_at,
    'pickup_code', case when o.status in ('ready_for_pickup') then o.pickup_code end,
    'tracking_code', o.tracking_code,
    'tracking_url', o.tracking_url,
    'transfer_reported_at', o.transfer_reported_at,
    'created_at', o.created_at,
    'is_guest', o.user_id is null,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', i.product_name_snapshot,
        'sku', i.sku_snapshot,
        'quantity', i.quantity,
        'unit_price', i.unit_price_snapshot,
        'subtotal', i.subtotal,
        'image', i.product_image_snapshot,
        'slug', sp.slug
      ) order by i.created_at)
      from public.storefront_order_items as i
      left join public.storefront_products as sp on sp.id = i.storefront_product_id
      where i.order_id = o.id), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'status', h.new_status, 'note', h.customer_visible_note, 'at', h.created_at
      ) order by h.created_at)
      from public.storefront_order_status_history as h
      where h.order_id = o.id), '[]'::jsonb),
    'transfer', case when o.payment_method = 'transfer' and o.status = 'awaiting_payment' then (
      select jsonb_build_object(
        'alias', s.value #>> '{transfer,alias}',
        'cvu', s.value #>> '{transfer,cvu}',
        'holder', s.value #>> '{transfer,holder}',
        'cuit', s.value #>> '{transfer,cuit}',
        'bank', s.value #>> '{transfer,bank}')
      from public.storefront_settings as s where s.key = 'checkout') end
  )
  from public.storefront_orders as o
  where o.id = p_order_id;
$$;
revoke all on function private.storefront_order_payload(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 12. Acciones de Administración sobre pedidos online (requieren sesión de administrador)
-- ---------------------------------------------------------------------------

create or replace function private.storefront_admin_order_action(
  p_order_id uuid, p_action text, p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_order public.storefront_orders%rowtype;
  v_code text;
  v_method text;
begin
  if not coalesce(private.is_admin(), false) then
    raise exception 'Solo un administrador puede gestionar pedidos.' using errcode = '42501';
  end if;
  select * into v_order from public.storefront_orders where id = p_order_id for update;
  if not found then
    raise exception 'No se encontró el pedido.' using errcode = 'P0002';
  end if;

  if p_action = 'confirm_transfer' then
    if v_order.payment_method <> 'transfer' then
      raise exception 'Este pedido no se paga por transferencia.' using errcode = '22023';
    end if;
    return private.storefront_apply_payment(p_order_id, 'transfer', null, 'approved',
      'Confirmada en Administración', v_order.total, 'ARS', v_actor, 'transferencia');

  elsif p_action = 'mark_preparing' then
    if v_order.status not in ('paid', 'awaiting_payment') then
      raise exception 'El pedido no se puede pasar a preparación.' using errcode = '22023';
    end if;
    if v_order.status = 'awaiting_payment' and v_order.payment_method <> 'pickup' then
      raise exception 'Primero hay que confirmar el pago.' using errcode = '22023';
    end if;
    update public.storefront_stock_reservations
    set expires_at = greatest(expires_at, now() + interval '7 days')
    where order_id = p_order_id and status = 'active';
    update public.storefront_orders
    set status = 'preparing', reserved_until = case when payment_status = 'approved'
          then reserved_until else greatest(reserved_until, now() + interval '7 days') end,
        updated_at = now()
    where id = p_order_id;
    perform private.storefront_order_history(p_order_id, v_order.status, 'preparing', v_actor,
      'Estamos preparando tu pedido.');

  elsif p_action = 'mark_ready' then
    if v_order.delivery_method <> 'pickup' or v_order.status not in ('paid', 'preparing', 'awaiting_payment') then
      raise exception 'El pedido no se puede marcar listo para retirar.' using errcode = '22023';
    end if;
    if v_order.status = 'awaiting_payment' and v_order.payment_method <> 'pickup' then
      raise exception 'Primero hay que confirmar el pago.' using errcode = '22023';
    end if;
    v_code := lpad((floor(random() * 1000000))::integer::text, 6, '0');
    update public.storefront_stock_reservations
    set expires_at = greatest(expires_at, now() + interval '7 days')
    where order_id = p_order_id and status = 'active';
    update public.storefront_orders
    set status = 'ready_for_pickup', ready_at = now(), pickup_code = v_code,
        reserved_until = case when payment_status = 'approved'
          then reserved_until else greatest(reserved_until, now() + interval '7 days') end,
        updated_at = now()
    where id = p_order_id;
    perform private.storefront_order_history(p_order_id, v_order.status, 'ready_for_pickup', v_actor,
      'Tu pedido está listo para retirar.');
    perform private.storefront_enqueue_mail('ready_for_pickup', p_order_id,
      v_order.customer_email_snapshot, p_order_id::text || ':ready', '{}'::jsonb);

  elsif p_action = 'mark_shipped' then
    if v_order.delivery_method not in ('shipping', 'local_delivery')
       or v_order.status not in ('paid', 'preparing') then
      raise exception 'El pedido no se puede marcar como despachado.' using errcode = '22023';
    end if;
    update public.storefront_orders
    set status = 'shipped', shipped_at = now(),
        tracking_code = nullif(left(btrim(coalesce(p_payload ->> 'tracking_code', '')), 60), ''),
        tracking_url = case when coalesce(p_payload ->> 'tracking_url', '') ~ '^https://'
          then left(p_payload ->> 'tracking_url', 500) end,
        updated_at = now()
    where id = p_order_id;
    perform private.storefront_order_history(p_order_id, v_order.status, 'shipped', v_actor,
      'Tu pedido ya viaja.');
    perform private.storefront_enqueue_mail('shipped', p_order_id,
      v_order.customer_email_snapshot, p_order_id::text || ':shipped', '{}'::jsonb);

  elsif p_action = 'mark_delivered' then
    if v_order.payment_status <> 'approved' then
      if v_order.payment_method <> 'pickup' then
        raise exception 'El pedido todavía no está pago.' using errcode = '22023';
      end if;
      v_method := coalesce(p_payload ->> 'gestion_method', '');
      if v_method not in ('efectivo', 'nx', 'mp', 'transferencia', 'otro') then
        raise exception 'Elegí con qué pagó el cliente.' using errcode = '22023';
      end if;
      update public.storefront_orders set status = 'ready_for_pickup' where id = p_order_id
        and status in ('awaiting_payment', 'preparing');
      perform private.storefront_apply_payment(p_order_id, 'pickup', null, 'approved',
        'Cobrado al retirar', v_order.total, 'ARS', v_actor, v_method);
    elsif v_order.status in ('paid', 'preparing', 'ready_for_pickup', 'shipped') then
      update public.storefront_orders
      set status = 'completed', delivered_at = now(), updated_at = now()
      where id = p_order_id;
      perform private.storefront_order_history(p_order_id, v_order.status, 'completed', v_actor,
        'Pedido entregado. ¡Gracias por tu compra!');
    else
      raise exception 'El pedido no se puede marcar como entregado.' using errcode = '22023';
    end if;
    perform private.storefront_enqueue_mail('review_request', p_order_id,
      v_order.customer_email_snapshot, p_order_id::text || ':review',
      jsonb_build_object('send_after', now() + interval '3 days'));
    update public.storefront_outbox set next_attempt_at = now() + interval '3 days'
    where dedupe_key = p_order_id::text || ':review' and status = 'pending';

  elsif p_action = 'cancel' then
    if v_order.payment_status = 'approved' then
      raise exception 'El pedido ya está cobrado. Devolvé el pago y anulá la venta en la gestión; después marcá el pedido como devuelto.'
        using errcode = '22023';
    end if;
    if v_order.status in ('cancelled', 'expired', 'completed', 'returned') then
      raise exception 'El pedido ya está cerrado.' using errcode = '22023';
    end if;
    update public.storefront_stock_reservations
    set status = 'released', closed_at = now()
    where order_id = p_order_id and status = 'active';
    update public.storefront_orders
    set status = 'cancelled', cancelled_at = now(), updated_at = now(),
        admin_notes = concat_ws(E'\n', admin_notes, nullif(left(p_payload ->> 'reason', 500), ''))
    where id = p_order_id;
    perform private.storefront_order_history(p_order_id, v_order.status, 'cancelled', v_actor,
      coalesce(nullif(left(p_payload ->> 'customer_note', 500), ''), 'Cancelamos tu pedido.'));
    perform private.storefront_enqueue_mail('order_cancelled', p_order_id,
      v_order.customer_email_snapshot, p_order_id::text || ':cancelled', '{}'::jsonb);

  elsif p_action = 'mark_returned' then
    if v_order.status not in ('paid', 'preparing', 'ready_for_pickup', 'shipped', 'completed') then
      raise exception 'Solo un pedido cobrado se puede marcar como devuelto.' using errcode = '22023';
    end if;
    update public.storefront_orders
    set status = 'returned', updated_at = now(), needs_attention = null,
        admin_notes = concat_ws(E'\n', admin_notes, nullif(left(p_payload ->> 'reason', 500), ''))
    where id = p_order_id;
    perform private.storefront_order_history(p_order_id, v_order.status, 'returned', v_actor,
      'Registramos la devolución del pedido.');

  elsif p_action = 'clear_attention' then
    update public.storefront_orders set needs_attention = null, updated_at = now() where id = p_order_id;

  else
    raise exception 'Acción desconocida.' using errcode = '22023';
  end if;

  return private.storefront_order_payload(p_order_id);
end
$$;
revoke all on function private.storefront_admin_order_action(uuid, text, jsonb)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 13. Puertas públicas (PostgREST solo expone public). Cada una aclara quién la puede llamar.
-- ---------------------------------------------------------------------------

-- Servidor de la tienda (service_role)
create or replace function public.storefront_checkout_create(p_input jsonb)
returns jsonb language sql security definer set search_path = ''
as $$ select private.storefront_create_checkout(p_input); $$;

create or replace function public.storefront_order_for_customer(
  p_order_number text, p_token_hash text, p_user_id uuid default null
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  perform private.storefront_expire_orders();
  select id into v_id from public.storefront_orders
  where order_number = upper(btrim(p_order_number))
    and ((p_token_hash is not null and access_token_hash = p_token_hash)
      or (p_user_id is not null and user_id = p_user_id));
  if v_id is null then return null; end if;
  return private.storefront_order_payload(v_id);
end
$$;

create or replace function public.storefront_order_internal(p_order_id uuid)
returns jsonb language sql security definer set search_path = ''
as $$ select private.storefront_order_payload(p_order_id); $$;

create or replace function public.storefront_order_by_number_internal(p_order_number text)
returns jsonb language sql security definer set search_path = ''
as $$
  select private.storefront_order_payload(id) from public.storefront_orders
  where order_number = upper(btrim(p_order_number));
$$;

create or replace function public.storefront_report_transfer(p_order_number text, p_token_hash text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_order public.storefront_orders%rowtype;
begin
  select * into v_order from public.storefront_orders
  where order_number = upper(btrim(p_order_number)) and access_token_hash = p_token_hash
  for update;
  if not found then raise exception 'No se encontró el pedido.' using errcode = 'P0002'; end if;
  if v_order.payment_method <> 'transfer' or v_order.status <> 'awaiting_payment' then
    raise exception 'Este pedido no espera una transferencia.' using errcode = '22023';
  end if;
  if v_order.transfer_reported_at is null then
    update public.storefront_orders
    set transfer_reported_at = now(),
        reserved_until = greatest(reserved_until, now() + interval '24 hours'),
        updated_at = now()
    where id = v_order.id;
    update public.storefront_stock_reservations
    set expires_at = greatest(expires_at, now() + interval '24 hours')
    where order_id = v_order.id and status = 'active';
    perform private.storefront_order_history(v_order.id, 'awaiting_payment', 'awaiting_payment', null,
      'Nos avisaste que transferiste. Lo confirmamos apenas veamos la acreditación.');
    perform private.storefront_enqueue_mail('admin_transfer_reported', v_order.id, '__admin__',
      v_order.id::text || ':transfer-reported', '{}'::jsonb);
  end if;
  return private.storefront_order_payload(v_order.id);
end
$$;

create or replace function public.storefront_apply_payment(
  p_order_id uuid, p_provider text, p_provider_payment_id text, p_status text,
  p_status_detail text, p_amount numeric, p_currency text
)
returns jsonb language sql security definer set search_path = ''
as $$
  select private.storefront_apply_payment(p_order_id, p_provider, p_provider_payment_id, p_status,
    p_status_detail, p_amount, p_currency, null, null);
$$;

create or replace function public.storefront_register_webhook(p_provider text, p_event_key text)
returns boolean language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.storefront_webhook_events (provider, event_key) values (p_provider, p_event_key)
  on conflict (provider, event_key) do nothing;
  return found;
end
$$;

create or replace function public.storefront_set_preference(p_order_id uuid, p_preference_id text)
returns void language sql security definer set search_path = ''
as $$
  insert into public.storefront_payments (order_id, provider, provider_preference_id, status, amount)
  select id, 'mercadopago', p_preference_id, 'preference_created', total
  from public.storefront_orders where id = p_order_id;
$$;

create or replace function public.storefront_expire_orders()
returns integer language sql security definer set search_path = ''
as $$ select private.storefront_expire_orders(); $$;

create or replace function public.storefront_claim_outbox(p_limit integer default 10)
returns setof public.storefront_outbox language sql security definer set search_path = ''
as $$
  update public.storefront_outbox as box
  set attempts = box.attempts + 1,
      next_attempt_at = now() + make_interval(mins => least(5 * (box.attempts + 1) * (box.attempts + 1), 720))
  where box.id in (
    select id from public.storefront_outbox
    where status = 'pending' and next_attempt_at <= now() and attempts < 8
    order by next_attempt_at
    limit greatest(least(p_limit, 50), 1)
    for update skip locked
  )
  returning box.*;
$$;

create or replace function public.storefront_finish_outbox(p_id uuid, p_ok boolean, p_error text)
returns void language sql security definer set search_path = ''
as $$
  update public.storefront_outbox
  set status = case when p_ok then 'sent' when attempts >= 8 then 'failed' else 'pending' end,
      sent_at = case when p_ok then now() else sent_at end,
      last_error = case when p_ok then null else left(p_error, 500) end
  where id = p_id;
$$;

create or replace function public.storefront_skip_outbox(p_id uuid, p_reason text)
returns void language sql security definer set search_path = ''
as $$
  update public.storefront_outbox set status = 'skipped', last_error = left(p_reason, 500) where id = p_id;
$$;

create or replace function public.storefront_join_waitlist(p_input jsonb)
returns void language sql security definer set search_path = ''
as $$
  insert into public.storefront_waitlist (kind, storefront_product_id, query, contact_name, email, phone, consent)
  values (
    coalesce(p_input ->> 'kind', 'product'),
    nullif(p_input ->> 'storefront_product_id', '')::uuid,
    nullif(left(btrim(coalesce(p_input ->> 'query', '')), 200), ''),
    nullif(left(btrim(coalesce(p_input ->> 'name', '')), 120), ''),
    nullif(lower(btrim(coalesce(p_input ->> 'email', ''))), ''),
    nullif(regexp_replace(coalesce(p_input ->> 'phone', ''), '[^0-9+ ()-]', '', 'g'), ''),
    coalesce((p_input ->> 'consent')::boolean, false)
  );
$$;

create or replace function public.storefront_track_visit(
  p_source text, p_medium text, p_campaign text, p_content text, p_landing text
)
returns void language sql security definer set search_path = ''
as $$
  insert into public.storefront_visit_stats (day, source, medium, campaign, content, landing, sessions)
  values (
    (now() at time zone 'America/Argentina/Cordoba')::date,
    left(lower(coalesce(nullif(btrim(p_source), ''), 'directo')), 60),
    left(lower(coalesce(nullif(btrim(p_medium), ''), '-')), 60),
    left(lower(coalesce(nullif(btrim(p_campaign), ''), '-')), 80),
    left(lower(coalesce(nullif(btrim(p_content), ''), '-')), 80),
    left(coalesce(nullif(btrim(p_landing), ''), '/'), 120),
    1
  )
  on conflict (day, source, medium, campaign, content, landing)
  do update set sessions = public.storefront_visit_stats.sessions + 1;
$$;

create or replace function public.storefront_checkout_settings()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'mercadopago', coalesce((c.value #>> '{mercadopago,enabled}')::boolean, false),
    'transfer', coalesce((c.value #>> '{transfer,enabled}')::boolean, false)
      and (coalesce(c.value #>> '{transfer,alias}', '') <> '' or coalesce(c.value #>> '{transfer,cvu}', '') <> ''),
    'pickup_payment', coalesce((c.value #>> '{pickup_payment,enabled}')::boolean, false),
    'pickup_payment_max', c.value #> '{pickup_payment,max_amount}',
    'mercadopago_reservation_minutes', coalesce((c.value ->> 'mercadopago_reservation_minutes')::integer, 30),
    'offline_reservation_hours', coalesce((c.value ->> 'offline_reservation_hours')::integer, 24),
    'delivery', jsonb_build_object(
      'pickup', coalesce((d.value #>> '{pickup,enabled}')::boolean, true),
      'local', coalesce((d.value #>> '{local,enabled}')::boolean, false),
      'local_zones', coalesce(d.value #> '{local,zones}', '[]'::jsonb),
      'correo', coalesce((d.value #>> '{correo,enabled}')::boolean, false),
      'correo_rates', coalesce(d.value #> '{correo,rates}', '{}'::jsonb)
    )
  )
  from (select private.storefront_setting('checkout') as value) as c,
       (select private.storefront_setting('delivery') as value) as d;
$$;

-- Administración (sesión de administrador)
create or replace function public.storefront_admin_order_action(
  p_order_id uuid, p_action text, p_payload jsonb default '{}'::jsonb
)
returns jsonb language sql security definer set search_path = ''
as $$ select private.storefront_admin_order_action(p_order_id, p_action, coalesce(p_payload, '{}'::jsonb)); $$;

create or replace function public.storefront_admin_save_settings(p_key text, p_value jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not coalesce(private.is_admin(), false) then
    raise exception 'Solo un administrador puede cambiar los ajustes.' using errcode = '42501';
  end if;
  if p_key not in ('checkout', 'delivery', 'promo') or jsonb_typeof(p_value) <> 'object' then
    raise exception 'Ajuste inválido.' using errcode = '22023';
  end if;
  insert into public.storefront_settings (key, value, is_public, updated_at)
  values (p_key, p_value, p_key = 'promo', now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
  insert into public.storefront_admin_logs (admin_user_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'settings.update', 'storefront_settings', p_key, jsonb_build_object('key', p_key));
end
$$;

create or replace function public.storefront_admin_settings()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  if not coalesce(private.is_admin(), false) then
    raise exception 'Solo un administrador puede ver los ajustes.' using errcode = '42501';
  end if;
  return (select jsonb_object_agg(key, value) from public.storefront_settings
    where key in ('checkout', 'delivery', 'promo'));
end
$$;

create or replace function public.storefront_admin_dashboard(p_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_since date := (now() at time zone 'America/Argentina/Cordoba')::date - greatest(least(p_days, 365), 1);
begin
  if not coalesce(private.is_admin(), false) then
    raise exception 'Solo un administrador puede ver el tablero.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'visits', coalesce((
      select jsonb_agg(row_to_json(v) order by v.sessions desc)
      from (
        select source, medium, campaign, content, sum(sessions)::integer as sessions
        from public.storefront_visit_stats where day >= v_since
        group by source, medium, campaign, content
        order by 5 desc limit 50
      ) as v), '[]'::jsonb),
    'orders', coalesce((
      select jsonb_agg(row_to_json(o) order by o.revenue desc)
      from (
        select coalesce(nullif(attribution ->> 'source', ''), 'directo') as source,
          coalesce(nullif(attribution ->> 'campaign', ''), '-') as campaign,
          coalesce(nullif(attribution ->> 'content', ''), '-') as content,
          count(*)::integer as orders,
          count(*) filter (where payment_status = 'approved')::integer as paid_orders,
          coalesce(sum(total) filter (where payment_status = 'approved'), 0) as revenue
        from public.storefront_orders
        where created_at >= v_since and source = 'storefront_checkout'
        group by 1, 2, 3
      ) as o), '[]'::jsonb),
    'totals', (
      select jsonb_build_object(
        'visits', coalesce((select sum(sessions) from public.storefront_visit_stats where day >= v_since), 0),
        'orders', count(*),
        'paid_orders', count(*) filter (where payment_status = 'approved'),
        'revenue', coalesce(sum(total) filter (where payment_status = 'approved'), 0),
        'attention', count(*) filter (where needs_attention is not null)
      )
      from public.storefront_orders
      where created_at >= v_since and source = 'storefront_checkout')
  );
end
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.storefront_checkout_create(jsonb)',
    'public.storefront_order_for_customer(text, text, uuid)',
    'public.storefront_order_internal(uuid)',
    'public.storefront_order_by_number_internal(text)',
    'public.storefront_report_transfer(text, text)',
    'public.storefront_apply_payment(uuid, text, text, text, text, numeric, text)',
    'public.storefront_register_webhook(text, text)',
    'public.storefront_set_preference(uuid, text)',
    'public.storefront_expire_orders()',
    'public.storefront_claim_outbox(integer)',
    'public.storefront_finish_outbox(uuid, boolean, text)',
    'public.storefront_skip_outbox(uuid, text)',
    'public.storefront_join_waitlist(jsonb)',
    'public.storefront_track_visit(text, text, text, text, text)',
    'public.storefront_checkout_settings()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  foreach f in array array[
    'public.storefront_admin_order_action(uuid, text, jsonb)',
    'public.storefront_admin_save_settings(text, jsonb)',
    'public.storefront_admin_settings()',
    'public.storefront_admin_dashboard(integer)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end
$$;

commit;

-- ---------------------------------------------------------------------------
-- 14. Vencimientos automáticos con pg_cron (fuera de la transacción: si la extensión no se puede
--     crear, la tienda igual vence las reservas cada vez que alguien abre un pedido o la compra).
-- ---------------------------------------------------------------------------

do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron no disponible: %', sqlerrm;
  end;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'storefront-expire-orders';
    perform cron.schedule('storefront-expire-orders', '*/5 * * * *',
      'select private.storefront_expire_orders()');
  end if;
end
$$;
