-- Tienda v3.1: el servidor elige el identificador del pedido (así arma el enlace de acceso sin
-- guardarlo) y se terminan de repartir en familias los productos que quedaron en "Otros".

begin;

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

  if exists (select 1 from public.storefront_orders where id = v_order_id) then
    raise exception 'El pedido ya existe.' using errcode = '23505';
  end if;

  insert into public.storefront_orders (
    id, order_number, user_id, status, delivery_method, shipping_address_snapshot,
    customer_name_snapshot, customer_email_snapshot, customer_phone_snapshot,
    subtotal, shipping_cost, total, customer_notes, source,
    access_token_hash, payment_method, payment_status, reserved_until,
    delivery_option, attribution, marketing_consent
  ) values (
    v_order_id, v_order_number, v_user, 'awaiting_payment', v_delivery_method, v_address,
    v_name, v_email, v_phone,
    v_subtotal, v_shipping, v_total,
    nullif(left(btrim(coalesce(p_input ->> 'notes', '')), 1000), ''),
    'storefront_checkout',
    v_token_hash, v_payment, 'pending', v_reserved_until,
    v_option,
    coalesce(p_input -> 'attribution', '{}'::jsonb),
    coalesce((p_input ->> 'marketing_consent')::boolean, false)
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
    'total', v_total,
    'payment_method', v_payment,
    'reserved_until', v_reserved_until
  );
end
$$;
revoke all on function private.storefront_create_checkout(jsonb) from public, anon, authenticated;

-- Familias: lo que quedó en "Otros" y tiene lugar natural en otra familia.
update public.storefront_products
set family_override = 'hogar'
where family_override is null
  and lower(name) ~ '(minisellador|sellador|pinzas|adhesivo|la gotita|poxir[aá]n|fastix)';

update public.storefront_products
set family_override = 'celular'
where family_override is null
  and lower(name) ~ '\mreloj';

commit;
