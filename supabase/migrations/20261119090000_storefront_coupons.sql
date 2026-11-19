-- Tienda v3.2: cupones, descuento por transferencia y pedidos de invitados que pasan a la cuenta.
--
-- Todo queda apagado: no se crea ningún cupón y el descuento por transferencia arranca en 0 %.
-- Mientras no haya un descuento, cada función se comporta igual que antes.
--
--   1. Cupones con porcentaje, alcance, vigencia y topes; se crean desde Administración.
--   2. La compra aplica primero el cupón y después el descuento por transferencia.
--   3. La venta en gestión se registra con los precios ya descontados.
--   4. Quien compró sin cuenta y después se registra con el mismo mail ve sus pedidos.

begin;

-- ---------------------------------------------------------------------------
-- 1. Cupones
-- ---------------------------------------------------------------------------

create table if not exists public.storefront_coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  label text not null default '',
  origin text not null default 'general'
    check (origin in ('general', 'reel', 'taller', 'mostrador')),
  percent numeric(5,2) not null check (percent > 0 and percent <= 50),
  -- 'accessories' deja afuera a los televisores.
  scope text not null default 'all' check (scope in ('all', 'accessories')),
  min_subtotal numeric(14,2) not null default 0 check (min_subtotal >= 0),
  max_discount numeric(14,2) check (max_discount is null or max_discount > 0),
  max_uses integer check (max_uses is null or max_uses > 0),
  once_per_customer boolean not null default true,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint storefront_coupons_code_format check (code ~ '^[A-Z0-9]{3,20}$'),
  constraint storefront_coupons_dates check (ends_at is null or ends_at > starts_at)
);

create unique index if not exists storefront_coupons_code_key on public.storefront_coupons (code);

alter table public.storefront_coupons enable row level security;
revoke all on public.storefront_coupons from public, anon, authenticated;
grant all on public.storefront_coupons to service_role;

alter table public.storefront_orders
  add column if not exists coupon_id uuid references public.storefront_coupons(id) on delete set null,
  add column if not exists coupon_code text,
  add column if not exists discount_detail jsonb not null default '{}'::jsonb;

create index if not exists storefront_orders_coupon_idx
  on public.storefront_orders (coupon_id) where coupon_id is not null;

-- Valida un cupón contra un carrito y devuelve cuánto descuenta. No modifica nada.
create or replace function private.storefront_coupon_quote(p_code text, p_items jsonb, p_email text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_coupon public.storefront_coupons%rowtype;
  v_subtotal numeric(14,2);
  v_eligible numeric(14,2);
  v_uses integer;
  v_amount numeric(14,2);
begin
  if v_code = '' then
    return jsonb_build_object('ok', false, 'error', 'Escribí el código del cupón.');
  end if;

  select * into v_coupon from public.storefront_coupons where code = v_code;
  if not found or not v_coupon.is_active or v_coupon.starts_at > now() then
    return jsonb_build_object('ok', false, 'error', 'Ese cupón no existe o ya no está activo.');
  end if;
  if v_coupon.ends_at is not null and v_coupon.ends_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'Ese cupón venció el '
      || to_char(v_coupon.ends_at at time zone 'America/Argentina/Cordoba', 'DD/MM') || '.');
  end if;

  select
    coalesce(sum(sp.public_price * requested.quantity), 0),
    coalesce(sum(sp.public_price * requested.quantity) filter (
      where v_coupon.scope = 'all' or sp.category_slug is distinct from 'televisores'), 0)
  into v_subtotal, v_eligible
  from (
    select (item ->> 'storefront_product_id')::uuid as id,
      sum((item ->> 'quantity')::integer)::integer as quantity
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as item
    group by 1
  ) as requested
  join public.storefront_products as sp on sp.id = requested.id
  where sp.is_published and sp.archived_at is null;

  if v_eligible <= 0 then
    return jsonb_build_object('ok', false, 'error', 'Ese cupón no aplica a los productos de tu carrito.');
  end if;
  if v_subtotal < v_coupon.min_subtotal then
    return jsonb_build_object('ok', false, 'error', 'Ese cupón es para compras desde $ '
      || to_char(v_coupon.min_subtotal, 'FM999G999G999') || '.');
  end if;

  -- Un pedido vencido o cancelado devuelve el uso.
  if v_coupon.max_uses is not null then
    select count(*) into v_uses
    from public.storefront_orders as o
    where o.coupon_id = v_coupon.id and o.status not in ('expired', 'cancelled');
    if v_uses >= v_coupon.max_uses then
      return jsonb_build_object('ok', false, 'error', 'Ese cupón ya se usó todas las veces disponibles.');
    end if;
  end if;
  if v_coupon.once_per_customer and v_email <> '' and exists (
    select 1 from public.storefront_orders as o
    where o.coupon_id = v_coupon.id
      and lower(o.customer_email_snapshot) = v_email
      and o.status not in ('expired', 'cancelled')
  ) then
    return jsonb_build_object('ok', false, 'error', 'Ya usaste ese cupón en otro pedido.');
  end if;

  v_amount := round(v_eligible * v_coupon.percent / 100);
  if v_coupon.max_discount is not null then
    v_amount := least(v_amount, v_coupon.max_discount);
  end if;
  v_amount := least(v_amount, v_eligible);

  return jsonb_build_object(
    'ok', true,
    'coupon_id', v_coupon.id,
    'code', v_coupon.code,
    'percent', v_coupon.percent,
    'scope', v_coupon.scope,
    'amount', v_amount,
    'eligible_subtotal', v_eligible
  );
end
$$;
revoke all on function private.storefront_coupon_quote(text, jsonb, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Crear el pedido con descuentos
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
  v_order_id uuid := coalesce(nullif(p_input ->> 'order_id', '')::uuid, gen_random_uuid());
  v_order_number text;
  v_line record;
  v_available integer;
  v_size_rank integer := 0;
  v_zone jsonb;
  v_rate numeric;
  v_delivery_method text;
  v_address jsonb;
  v_option jsonb;
  v_coupon_code text := nullif(upper(regexp_replace(coalesce(p_input ->> 'coupon', ''), '[^A-Za-z0-9]', '', 'g')), '');
  v_coupon jsonb;
  v_coupon_id uuid;
  v_coupon_discount numeric(14,2) := 0;
  v_transfer_percent numeric := least(greatest(coalesce(
    (v_checkout #>> '{transfer,discount_percent}')::numeric, 0), 0), 30);
  v_transfer_discount numeric(14,2) := 0;
  v_discount numeric(14,2) := 0;
  v_discount_detail jsonb := '{}'::jsonb;
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

  -- Descuentos: primero el cupón, después el de transferencia sobre lo que queda.
  if v_coupon_code is not null then
    -- Se bloquea el cupón para que dos compras a la vez no pasen el tope de usos.
    perform 1 from public.storefront_coupons where code = v_coupon_code for update;
    v_coupon := private.storefront_coupon_quote(v_coupon_code, v_items, v_email);
    if not (v_coupon ->> 'ok')::boolean then
      raise exception '%', v_coupon ->> 'error' using errcode = '22023';
    end if;
    v_coupon_id := (v_coupon ->> 'coupon_id')::uuid;
    v_coupon_discount := (v_coupon ->> 'amount')::numeric;
    v_discount_detail := v_discount_detail || jsonb_build_object('coupon', jsonb_build_object(
      'code', v_coupon ->> 'code', 'percent', (v_coupon ->> 'percent')::numeric,
      'scope', v_coupon ->> 'scope', 'amount', v_coupon_discount));
  end if;
  if v_payment = 'transfer' and v_transfer_percent > 0 then
    v_transfer_discount := round((v_subtotal - v_coupon_discount) * v_transfer_percent / 100);
    if v_transfer_discount > 0 then
      v_discount_detail := v_discount_detail || jsonb_build_object('transfer', jsonb_build_object(
        'percent', v_transfer_percent, 'amount', v_transfer_discount));
    end if;
  end if;
  v_discount := least(v_coupon_discount + v_transfer_discount, v_subtotal);

  v_total := v_subtotal + v_shipping - v_discount;

  if v_payment = 'pickup' then
    if (v_checkout #>> '{pickup_payment,max_amount}') is not null
       and v_total > (v_checkout #>> '{pickup_payment,max_amount}')::numeric then
      raise exception 'El pago al retirar es para pedidos de hasta $ %.',
        to_char((v_checkout #>> '{pickup_payment,max_amount}')::numeric, 'FM999G999G999')
        using errcode = '22023';
    end if;
  end if;

  v_order_number := 'CHT-' || lpad(nextval('private.storefront_order_number_seq')::text, 6, '0');

  if exists (select 1 from public.storefront_orders where id = v_order_id) then
    raise exception 'El pedido ya existe.' using errcode = '23505';
  end if;

  insert into public.storefront_orders (
    id, order_number, user_id, status, delivery_method, shipping_address_snapshot,
    customer_name_snapshot, customer_email_snapshot, customer_phone_snapshot,
    subtotal, shipping_cost, total, customer_notes, source,
    access_token_hash, payment_method, payment_status, reserved_until,
    delivery_option, attribution, marketing_consent,
    discount_total, coupon_id, coupon_code, discount_detail
  ) values (
    v_order_id, v_order_number, v_user, 'awaiting_payment', v_delivery_method, v_address,
    v_name, v_email, v_phone,
    v_subtotal, v_shipping, v_total,
    nullif(left(btrim(coalesce(p_input ->> 'notes', '')), 1000), ''),
    'storefront_checkout',
    v_token_hash, v_payment, 'pending', v_reserved_until,
    v_option,
    coalesce(p_input -> 'attribution', '{}'::jsonb),
    coalesce((p_input ->> 'marketing_consent')::boolean, false),
    v_discount, v_coupon_id, v_coupon ->> 'code', v_discount_detail
  );

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
    'discount_total', v_discount,
    'total', v_total,
    'payment_method', v_payment,
    'reserved_until', v_reserved_until
  );
end
$$;
revoke all on function private.storefront_create_checkout(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Venta en la gestión: con descuento, los renglones van con el precio ya descontado
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
      else '' end
    || case when v_order.discount_total > 0
      then ' · descuento $ ' || to_char(v_order.discount_total, 'FM999G999G999')
        || coalesce(' (cupón ' || v_order.coupon_code || ')', '')
      else '' end;
  v_sale_number := public.generate_sale_number();

  insert into public.sales (sale_number, subtotal, cost_total, profit_total, notes, sold_at, created_by)
  values (v_sale_number, v_subtotal, v_cost, v_subtotal - v_cost, v_note, now(), p_actor)
  returning id into v_sale_id;

  -- La gestión no tiene un campo de descuento: la venta se registra con los precios ya
  -- descontados, repartiendo el descuento en proporción entre los renglones. El renglón más
  -- grande absorbe el redondeo, así los renglones suman exactamente lo cobrado.
  insert into public.sale_items (sale_id, product_id, quantity, unit_price, unit_cost, total, description)
  select v_sale_id, line.product_id, line.quantity,
    case when v_order.discount_total > 0
      then round(line.net_total / line.quantity, 2) else line.unit_price_snapshot end,
    line.cost, line.net_total, line.product_name_snapshot
  from (
    select priced.*,
      case when priced.position = 1
        then priced.net + (v_subtotal - sum(priced.net) over ())
        else priced.net end as net_total
    from (
      select item.product_id, item.quantity, item.unit_price_snapshot, item.product_name_snapshot,
        product.cost,
        case when v_order.discount_total > 0 and v_order.subtotal > 0
          then round(item.subtotal * v_subtotal / v_order.subtotal, 2)
          else item.subtotal end as net,
        row_number() over (order by item.subtotal desc, item.id) as position
      from public.storefront_order_items as item
      left join public.products as product on product.id = item.product_id
      where item.order_id = p_order_id
    ) as priced
  ) as line;

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
-- 4. El pedido informa el cupón y el detalle del descuento
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
    'coupon_code', o.coupon_code,
    'discount_detail', o.discount_detail,
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
-- 5. Ajustes públicos de la compra
-- ---------------------------------------------------------------------------

create or replace function public.storefront_checkout_settings()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'mercadopago', coalesce((c.value #>> '{mercadopago,enabled}')::boolean, false),
    'transfer', coalesce((c.value #>> '{transfer,enabled}')::boolean, false)
      and (coalesce(c.value #>> '{transfer,alias}', '') <> '' or coalesce(c.value #>> '{transfer,cvu}', '') <> ''),
    'transfer_discount_percent', least(greatest(coalesce((c.value #>> '{transfer,discount_percent}')::numeric, 0), 0), 30),
    'coupons', exists (select 1 from public.storefront_coupons as coupon
      where coupon.is_active and coupon.starts_at <= now() and (coupon.ends_at is null or coupon.ends_at > now())),
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
-- ---------------------------------------------------------------------------
-- 6. Cotización para mostrar el total antes de confirmar la compra
-- ---------------------------------------------------------------------------

create or replace function public.storefront_checkout_quote(p_input jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_checkout jsonb := private.storefront_setting('checkout');
  v_items jsonb := coalesce(p_input -> 'items', '[]'::jsonb);
  v_code text := nullif(btrim(coalesce(p_input ->> 'coupon', '')), '');
  v_subtotal numeric(14,2);
  v_coupon jsonb;
  v_coupon_amount numeric(14,2) := 0;
  v_transfer_percent numeric := least(greatest(coalesce(
    (v_checkout #>> '{transfer,discount_percent}')::numeric, 0), 0), 30);
begin
  select coalesce(sum(sp.public_price * requested.quantity), 0)
  into v_subtotal
  from (
    select (item ->> 'storefront_product_id')::uuid as id,
      sum((item ->> 'quantity')::integer)::integer as quantity
    from jsonb_array_elements(v_items) as item
    group by 1
  ) as requested
  join public.storefront_products as sp on sp.id = requested.id
  where sp.is_published and sp.archived_at is null;

  if v_code is not null then
    v_coupon := private.storefront_coupon_quote(v_code, v_items, p_input ->> 'email');
    if (v_coupon ->> 'ok')::boolean then
      v_coupon_amount := (v_coupon ->> 'amount')::numeric;
    end if;
  end if;

  return jsonb_build_object(
    'subtotal', v_subtotal,
    'coupon', case when v_coupon is null then null else v_coupon - 'coupon_id' end,
    'coupon_discount', v_coupon_amount,
    'transfer_discount_percent', v_transfer_percent,
    'transfer_discount', round((v_subtotal - v_coupon_amount) * v_transfer_percent / 100)
  );
end
$$;

-- ---------------------------------------------------------------------------
-- 7. Administración de cupones (sesión de administrador)
-- ---------------------------------------------------------------------------

create or replace function public.storefront_admin_coupons()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not coalesce(private.is_admin(), false) then
    raise exception 'Solo un administrador puede ver los cupones.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id,
      'code', c.code,
      'label', c.label,
      'origin', c.origin,
      'percent', c.percent,
      'scope', c.scope,
      'min_subtotal', c.min_subtotal,
      'max_discount', c.max_discount,
      'max_uses', c.max_uses,
      'once_per_customer', c.once_per_customer,
      'starts_at', c.starts_at,
      'ends_at', c.ends_at,
      'is_active', c.is_active,
      'created_at', c.created_at,
      'uses', coalesce(stats.uses, 0),
      'paid_orders', coalesce(stats.paid_orders, 0),
      'revenue', coalesce(stats.revenue, 0),
      'discount_given', coalesce(stats.discount_given, 0)
    ) order by c.is_active desc, c.created_at desc)
    from public.storefront_coupons as c
    left join lateral (
      select
        count(*) filter (where o.status not in ('expired', 'cancelled')) as uses,
        count(*) filter (where o.payment_status = 'approved') as paid_orders,
        sum(o.total - o.shipping_cost) filter (where o.payment_status = 'approved') as revenue,
        sum((o.discount_detail #>> '{coupon,amount}')::numeric)
          filter (where o.payment_status = 'approved') as discount_given
      from public.storefront_orders as o
      where o.coupon_id = c.id
    ) as stats on true
  ), '[]'::jsonb);
end
$$;

create or replace function public.storefront_admin_save_coupon(p_input jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := nullif(p_input ->> 'id', '')::uuid;
  v_code text := upper(regexp_replace(coalesce(p_input ->> 'code', ''), '[^A-Za-z0-9]', '', 'g'));
  v_percent numeric := (p_input ->> 'percent')::numeric;
  v_scope text := coalesce(nullif(p_input ->> 'scope', ''), 'all');
  v_origin text := coalesce(nullif(p_input ->> 'origin', ''), 'general');
  v_min numeric := coalesce(nullif(p_input ->> 'min_subtotal', '')::numeric, 0);
  v_max_discount numeric := nullif(p_input ->> 'max_discount', '')::numeric;
  v_max_uses integer := nullif(p_input ->> 'max_uses', '')::integer;
  v_starts timestamptz := coalesce(nullif(p_input ->> 'starts_at', '')::timestamptz, now());
  v_ends timestamptz := nullif(p_input ->> 'ends_at', '')::timestamptz;
begin
  if not coalesce(private.is_admin(), false) then
    raise exception 'Solo un administrador puede cambiar los cupones.' using errcode = '42501';
  end if;
  if v_percent is null or v_percent <= 0 or v_percent > 50 then
    raise exception 'El descuento tiene que ser entre 1 %% y 50 %%.' using errcode = '22023';
  end if;
  if v_scope not in ('all', 'accessories') or v_origin not in ('general', 'reel', 'taller', 'mostrador') then
    raise exception 'Revisá el alcance y el origen del cupón.' using errcode = '22023';
  end if;
  if v_min < 0 or (v_max_discount is not null and v_max_discount <= 0)
     or (v_max_uses is not null and v_max_uses <= 0) then
    raise exception 'Los topes tienen que ser mayores a cero.' using errcode = '22023';
  end if;
  if v_ends is not null and v_ends <= v_starts then
    raise exception 'La fecha de vencimiento tiene que ser posterior al inicio.' using errcode = '22023';
  end if;

  if v_id is null then
    if v_code !~ '^[A-Z0-9]{3,20}$' then
      raise exception 'El código lleva entre 3 y 20 letras o números, sin espacios.' using errcode = '22023';
    end if;
    if exists (select 1 from public.storefront_coupons where code = v_code) then
      raise exception 'Ya existe un cupón con ese código.' using errcode = '23505';
    end if;
    insert into public.storefront_coupons (
      code, label, origin, percent, scope, min_subtotal, max_discount, max_uses,
      once_per_customer, starts_at, ends_at, is_active, created_by
    ) values (
      v_code, left(btrim(coalesce(p_input ->> 'label', '')), 120), v_origin, v_percent, v_scope,
      v_min, v_max_discount, v_max_uses,
      coalesce((p_input ->> 'once_per_customer')::boolean, true), v_starts, v_ends,
      coalesce((p_input ->> 'is_active')::boolean, true), auth.uid()
    ) returning id into v_id;
  else
    -- El código no se cambia: ya puede estar impreso o dicho en un video.
    update public.storefront_coupons
    set label = left(btrim(coalesce(p_input ->> 'label', '')), 120),
        origin = v_origin,
        percent = v_percent,
        scope = v_scope,
        min_subtotal = v_min,
        max_discount = v_max_discount,
        max_uses = v_max_uses,
        once_per_customer = coalesce((p_input ->> 'once_per_customer')::boolean, true),
        starts_at = v_starts,
        ends_at = v_ends,
        is_active = coalesce((p_input ->> 'is_active')::boolean, true),
        updated_at = now()
    where id = v_id;
    if not found then
      raise exception 'No se encontró el cupón.' using errcode = 'P0002';
    end if;
  end if;

  insert into public.storefront_admin_logs (admin_user_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'coupon.save', 'storefront_coupon', v_id::text,
    jsonb_build_object('code', (select code from public.storefront_coupons where id = v_id)));
  return v_id;
end
$$;

-- ---------------------------------------------------------------------------
-- 8. Pedidos hechos sin cuenta que pasan a la cuenta del mismo mail
-- ---------------------------------------------------------------------------

-- Solo con el mail verificado: así nadie se queda con pedidos ajenos registrando un mail que no es suyo.
create or replace function public.storefront_claim_guest_orders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_count integer := 0;
begin
  if v_user is null then
    return 0;
  end if;
  select lower(email) into v_email
  from auth.users
  where id = v_user and email_confirmed_at is not null;
  if v_email is null or v_email = '' then
    return 0;
  end if;
  update public.storefront_orders
  set user_id = v_user, updated_at = now()
  where user_id is null
    and source = 'storefront_checkout'
    and lower(customer_email_snapshot) = v_email;
  get diagnostics v_count = row_count;
  return v_count;
end
$$;

-- ---------------------------------------------------------------------------
-- 9. Permisos
-- ---------------------------------------------------------------------------

revoke all on function public.storefront_checkout_quote(jsonb) from public, anon, authenticated;
grant execute on function public.storefront_checkout_quote(jsonb) to service_role;
revoke all on function public.storefront_checkout_settings() from public, anon, authenticated;
grant execute on function public.storefront_checkout_settings() to service_role;

revoke all on function public.storefront_admin_coupons() from public, anon;
grant execute on function public.storefront_admin_coupons() to authenticated, service_role;
revoke all on function public.storefront_admin_save_coupon(jsonb) from public, anon;
grant execute on function public.storefront_admin_save_coupon(jsonb) to authenticated, service_role;
revoke all on function public.storefront_claim_guest_orders() from public, anon;
grant execute on function public.storefront_claim_guest_orders() to authenticated, service_role;

commit;
