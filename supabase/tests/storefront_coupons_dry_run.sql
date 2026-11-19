-- Prueba en seco de 20261119090000_storefront_coupons.sql contra la base real.
-- Corre la migración y los casos dentro de una transacción que termina en ROLLBACK.
-- Las secuencias no vuelven atrás con ROLLBACK: se restauran al final solo si nadie las usó mientras tanto.
\set ON_ERROR_STOP 1
\pset pager off
select last_value as sale_seq_before from public.sale_number_seq \gset
select last_value as order_seq_before from private.storefront_order_number_seq \gset

begin;
\i /tmp/migration_body.sql

do $$
declare
  v_product record;
  v_tv record;
  v_quote jsonb;
  v_result jsonb;
  v_order_id uuid;
  v_sale uuid;
  v_subtotal numeric;
  v_coupon_amount numeric;
  v_transfer_amount numeric;
  v_expected numeric;
  v_failed boolean;
  v_message text;
begin
  -- Sin cupón y con el descuento en 0 %, nada cambia.
  if (public.storefront_checkout_settings() ->> 'transfer_discount_percent')::numeric <> 0 then
    raise exception 'FALLA: el descuento por transferencia no arranca en 0';
  end if;
  if (public.storefront_checkout_settings() ->> 'coupons')::boolean then
    raise notice 'ya hay cupones activos';
  end if;

  update public.storefront_settings
  set value = jsonb_set(jsonb_set(jsonb_set(value, '{transfer,enabled}', 'true'),
    '{transfer,alias}', '"prueba.alias"'), '{transfer,discount_percent}', '5')
  where key = 'checkout';

  select sp.id, sp.product_id, sp.name, p.stock, sp.public_price into v_product
  from public.storefront_products sp join public.products p on p.id = sp.product_id
  where sp.is_published and p.is_active and p.stock between 4 and 30 and sp.public_price > 0
    and sp.category_slug <> 'televisores'
    and not exists (select 1 from public.repair_part_requests r where r.product_id = p.id and r.reserved_quantity > 0)
  order by sp.public_price desc limit 1;
  raise notice 'producto de prueba: % ($ %, stock %)', v_product.name, v_product.public_price, v_product.stock;

  insert into public.storefront_coupons (code, label, origin, percent, scope, max_uses, once_per_customer)
  values ('PRUEBA10', 'Cupón de prueba', 'reel', 10, 'accessories', 2, true);

  v_subtotal := v_product.public_price * 3;
  v_coupon_amount := round(v_subtotal * 0.10);
  v_transfer_amount := round((v_subtotal - v_coupon_amount) * 0.05);
  v_expected := v_subtotal - v_coupon_amount - v_transfer_amount;

  -- 1. Cotización
  v_quote := public.storefront_checkout_quote(jsonb_build_object(
    'items', jsonb_build_array(jsonb_build_object('storefront_product_id', v_product.id, 'quantity', 3)),
    'coupon', ' prueba-10 ', 'email', 'cupon@example.com'));
  raise notice 'cotización: %', v_quote;
  if (v_quote ->> 'coupon_discount')::numeric <> v_coupon_amount
     or (v_quote ->> 'transfer_discount')::numeric <> v_transfer_amount
     or v_quote #>> '{coupon,code}' <> 'PRUEBA10' or v_quote -> 'coupon' ? 'coupon_id' then
    raise exception 'FALLA: la cotización no coincide';
  end if;

  -- 2. Cupón inexistente: la compra se frena con un mensaje claro
  v_failed := false;
  begin
    perform public.storefront_checkout_create(jsonb_build_object(
      'items', jsonb_build_array(jsonb_build_object('storefront_product_id', v_product.id, 'quantity', 1)),
      'customer', jsonb_build_object('name', 'Cliente de prueba', 'email', 'cupon@example.com', 'phone', '3571000000'),
      'delivery', jsonb_build_object('kind', 'pickup'), 'payment_method', 'transfer',
      'access_token_hash', 'hash-cupon-0', 'coupon', 'NOEXISTE'));
  exception when sqlstate '22023' then
    v_failed := true; get stacked diagnostics v_message = message_text;
  end;
  if not v_failed then raise exception 'FALLA: aceptó un cupón inexistente'; end if;
  raise notice 'cupón inexistente: %', v_message;

  -- 3. Pedido con cupón y transferencia
  v_result := public.storefront_checkout_create(jsonb_build_object(
    'items', jsonb_build_array(jsonb_build_object('storefront_product_id', v_product.id, 'quantity', 3)),
    'customer', jsonb_build_object('name', 'Cliente de prueba', 'email', 'cupon@example.com', 'phone', '3571000000'),
    'delivery', jsonb_build_object('kind', 'pickup'), 'payment_method', 'transfer',
    'access_token_hash', 'hash-cupon-1', 'coupon', 'prueba10'));
  v_order_id := (v_result ->> 'order_id')::uuid;
  raise notice 'pedido: %', v_result;
  if (v_result ->> 'total')::numeric <> v_expected
     or (v_result ->> 'discount_total')::numeric <> v_coupon_amount + v_transfer_amount then
    raise exception 'FALLA: total con descuento % (esperado %)', v_result ->> 'total', v_expected;
  end if;
  if (select discount_detail #>> '{coupon,code}' from public.storefront_orders where id = v_order_id) <> 'PRUEBA10'
     or (private.storefront_order_payload(v_order_id) ->> 'coupon_code') <> 'PRUEBA10' then
    raise exception 'FALLA: el pedido no guardó el cupón';
  end if;

  -- 4. El mismo cliente no lo usa dos veces
  v_failed := false;
  begin
    perform public.storefront_checkout_create(jsonb_build_object(
      'items', jsonb_build_array(jsonb_build_object('storefront_product_id', v_product.id, 'quantity', 1)),
      'customer', jsonb_build_object('name', 'Cliente de prueba', 'email', 'CUPON@example.com', 'phone', '3571000000'),
      'delivery', jsonb_build_object('kind', 'pickup'), 'payment_method', 'transfer',
      'access_token_hash', 'hash-cupon-2', 'coupon', 'PRUEBA10'));
  exception when sqlstate '22023' then
    v_failed := true; get stacked diagnostics v_message = message_text;
  end;
  if not v_failed then raise exception 'FALLA: el mismo cliente usó el cupón dos veces'; end if;
  raise notice 'segundo uso del mismo cliente: %', v_message;

  -- 5. Tope de usos
  update public.storefront_coupons set max_uses = 1 where code = 'PRUEBA10';
  v_quote := public.storefront_checkout_quote(jsonb_build_object(
    'items', jsonb_build_array(jsonb_build_object('storefront_product_id', v_product.id, 'quantity', 1)),
    'coupon', 'PRUEBA10', 'email', 'otro@example.com'));
  if (v_quote #>> '{coupon,ok}')::boolean then raise exception 'FALLA: pasó el tope de usos'; end if;
  raise notice 'tope de usos: %', v_quote #>> '{coupon,error}';

  -- 6. Cupón de accesorios con un carrito de solo televisores
  select sp.id into v_tv from public.storefront_products sp
  where sp.is_published and sp.category_slug = 'televisores' and sp.public_price > 0 limit 1;
  if v_tv.id is not null then
    update public.storefront_coupons set max_uses = null where code = 'PRUEBA10';
    v_quote := public.storefront_checkout_quote(jsonb_build_object(
      'items', jsonb_build_array(jsonb_build_object('storefront_product_id', v_tv.id, 'quantity', 1)),
      'coupon', 'PRUEBA10', 'email', 'otro@example.com'));
    if (v_quote #>> '{coupon,ok}')::boolean then raise exception 'FALLA: descontó un televisor'; end if;
    raise notice 'solo televisores: %', v_quote #>> '{coupon,error}';
  end if;

  -- 7. Cupón vencido
  update public.storefront_coupons set starts_at = now() - interval '3 days', ends_at = now() - interval '1 day'
  where code = 'PRUEBA10';
  v_quote := public.storefront_checkout_quote(jsonb_build_object(
    'items', jsonb_build_array(jsonb_build_object('storefront_product_id', v_product.id, 'quantity', 1)),
    'coupon', 'PRUEBA10', 'email', 'otro@example.com'));
  if (v_quote #>> '{coupon,ok}')::boolean then raise exception 'FALLA: aceptó un cupón vencido'; end if;
  raise notice 'vencido: %', v_quote #>> '{coupon,error}';

  -- 8. Al cobrar, la venta en gestión queda con los precios ya descontados
  v_result := private.storefront_apply_payment(v_order_id, 'transfer', null, 'approved', 'prueba',
    v_expected, 'ARS', null, 'transferencia');
  if not (v_result ->> 'applied')::boolean then
    raise exception 'FALLA: no se aplicó el pago: %', v_result;
  end if;
  select gestion_sale_id into v_sale from public.storefront_orders where id = v_order_id;
  if (select subtotal from public.sales where id = v_sale) <> v_expected
     or (select sum(total) from public.sale_items where sale_id = v_sale) <> v_expected
     or (select sum(amount) from public.sale_payments where sale_id = v_sale) <> v_expected
     or (select monto from public.movimientos_caja where referencia_id = v_sale and referencia_tabla = 'sales') <> v_expected then
    raise exception 'FALLA: la venta en gestión no coincide con lo cobrado';
  end if;
  raise notice 'venta en gestión: % · renglones %', (select notes from public.sales where id = v_sale),
    (select jsonb_agg(jsonb_build_object('cant', quantity, 'unit', unit_price, 'total', total)) from public.sale_items where sale_id = v_sale);

  -- 9. Un pedido sin descuento sigue igual que antes
  update public.storefront_settings
  set value = jsonb_set(value, '{transfer,discount_percent}', '0') where key = 'checkout';
  v_result := public.storefront_checkout_create(jsonb_build_object(
    'items', jsonb_build_array(jsonb_build_object('storefront_product_id', v_product.id, 'quantity', 1)),
    'customer', jsonb_build_object('name', 'Cliente de prueba', 'email', 'sin@example.com', 'phone', '3571000000'),
    'delivery', jsonb_build_object('kind', 'pickup'), 'payment_method', 'transfer',
    'access_token_hash', 'hash-cupon-3'));
  if (v_result ->> 'total')::numeric <> v_product.public_price or (v_result ->> 'discount_total')::numeric <> 0 then
    raise exception 'FALLA: un pedido sin descuento cambió de total';
  end if;
  v_order_id := (v_result ->> 'order_id')::uuid;
  perform private.storefront_apply_payment(v_order_id, 'transfer', null, 'approved', 'prueba',
    v_product.public_price, 'ARS', null, 'transferencia');
  select gestion_sale_id into v_sale from public.storefront_orders where id = v_order_id;
  if (select unit_price from public.sale_items where sale_id = v_sale) <> v_product.public_price
     or (select total from public.sale_items where sale_id = v_sale) <> v_product.public_price then
    raise exception 'FALLA: la venta sin descuento no quedó al precio de lista';
  end if;

  raise notice 'TODAS LAS PRUEBAS PASARON';
end
$$;

rollback;

select last_value as sale_seq_after from public.sale_number_seq \gset
select last_value as order_seq_after from private.storefront_order_number_seq \gset
select case when :sale_seq_after - :sale_seq_before = 2
  then setval('public.sale_number_seq', :sale_seq_before) end as venta_restaurada;
select case when :order_seq_after - :order_seq_before <= 6
  then setval('private.storefront_order_number_seq', :order_seq_before) end as pedido_restaurado;
