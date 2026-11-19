-- Prueba en seco de 20261119030000_storefront_v3_commerce.sql contra la base real.
-- Corre la migración y los casos de prueba dentro de una transacción que termina en ROLLBACK.
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
  v_result jsonb;
  v_order jsonb;
  v_order_id uuid;
  v_stock_before integer;
  v_stock_after integer;
  v_sale uuid;
  v_count integer;
  v_failed boolean;
begin
  select count(*) into v_count from public.get_storefront_products_v3();
  raise notice 'catalogo v3: % productos', v_count;
  for v_product in
    select p ->> 'family_slug' as family, count(*) as n
    from public.get_storefront_products_v3() as p group by 1 order by 2 desc
  loop
    raise notice 'familia %: %', v_product.family, v_product.n;
  end loop;

  update public.storefront_settings
  set value = jsonb_set(jsonb_set(value, '{transfer,enabled}', 'true'), '{transfer,alias}', '"prueba.alias"')
  where key = 'checkout';
  update public.storefront_settings
  set value = jsonb_set(value, '{pickup_payment,enabled}', 'true')
  where key = 'checkout';

  select sp.id, sp.product_id, sp.name, p.stock, sp.public_price into v_product
  from public.storefront_products sp join public.products p on p.id = sp.product_id
  where sp.is_published and p.is_active and p.stock >= 3 and sp.public_price > 0
    and not exists (select 1 from public.repair_part_requests r where r.product_id = p.id and r.reserved_quantity > 0)
  order by p.stock desc limit 1;
  raise notice 'producto de prueba: % (stock %)', v_product.name, v_product.stock;
  v_stock_before := v_product.stock;

  -- 1. Pedido por transferencia
  v_result := public.storefront_checkout_create(jsonb_build_object(
    'items', jsonb_build_array(jsonb_build_object('storefront_product_id', v_product.id, 'quantity', 2)),
    'customer', jsonb_build_object('name', 'Cliente de prueba', 'email', 'prueba@example.com', 'phone', '3571000000'),
    'delivery', jsonb_build_object('kind', 'pickup'),
    'payment_method', 'transfer',
    'access_token_hash', 'hash-de-prueba',
    'attribution', jsonb_build_object('source', 'instagram', 'campaign', 'reel-prueba')
  ));
  v_order_id := (v_result ->> 'order_id')::uuid;
  raise notice 'pedido creado: %', v_result;
  if private.storefront_reserved_quantity(v_product.product_id) <> 2 then
    raise exception 'FALLA: la reserva no quedó en 2';
  end if;

  -- 2. El mostrador no puede vender lo reservado
  v_failed := false;
  begin
    update public.products set stock = 1 where id = v_product.product_id and v_product.stock >= 3;
  exception when sqlstate '23514' then v_failed := true;
  end;
  if v_product.stock - 1 >= 2 and not v_failed then
    -- bajar a 1 deja 1 < 2 reservadas: tiene que fallar
    raise exception 'FALLA: el control de reservas dejó vender stock reservado';
  end if;
  raise notice 'control de reservas: ok';

  -- 3. No se puede pedir más de lo disponible
  v_failed := false;
  begin
    perform public.storefront_checkout_create(jsonb_build_object(
      'items', jsonb_build_array(jsonb_build_object('storefront_product_id', v_product.id, 'quantity', v_product.stock - 1)),
      'customer', jsonb_build_object('name', 'Otro cliente', 'email', 'otro@example.com', 'phone', '3571000001'),
      'delivery', jsonb_build_object('kind', 'pickup'), 'payment_method', 'transfer',
      'access_token_hash', 'otro-hash'));
  exception when sqlstate '23514' then v_failed := true;
  end;
  if not v_failed then raise exception 'FALLA: se pudo pedir stock reservado'; end if;
  raise notice 'sobreventa bloqueada: ok';

  -- 4. Acceso con clave
  v_order := public.storefront_order_for_customer(v_result ->> 'order_number', 'hash-de-prueba', null);
  if v_order is null or v_order -> 'transfer' ->> 'alias' <> 'prueba.alias' then
    raise exception 'FALLA: acceso del cliente %', v_order;
  end if;
  if public.storefront_order_for_customer(v_result ->> 'order_number', 'otra-clave', null) is not null then
    raise exception 'FALLA: se pudo ver el pedido con otra clave';
  end if;
  raise notice 'acceso por enlace: ok';

  -- 5. Aviso de transferencia y confirmación con venta en la gestión
  perform public.storefront_report_transfer(v_result ->> 'order_number', 'hash-de-prueba');
  v_result := private.storefront_apply_payment(v_order_id, 'transfer', null, 'approved', 'prueba',
    (v_result ->> 'total')::numeric, 'ARS', null, 'transferencia');
  raise notice 'pago aplicado: %', v_result;
  select stock into v_stock_after from public.products where id = v_product.product_id;
  select gestion_sale_id into v_sale from public.storefront_orders where id = v_order_id;
  if v_stock_after <> v_stock_before - 2 or v_sale is null then
    raise exception 'FALLA: stock % -> %, venta %', v_stock_before, v_stock_after, v_sale;
  end if;
  if (select count(*) from public.sale_items where sale_id = v_sale) <> 1
     or (select count(*) from public.movimientos_caja where referencia_id = v_sale) <> 1
     or (select count(*) from public.stock_movements where reference_id = v_sale) <> 1 then
    raise exception 'FALLA: la venta en la gestión quedó incompleta';
  end if;
  if private.storefront_reserved_quantity(v_product.product_id) <> 0 then
    raise exception 'FALLA: la reserva no se consumió';
  end if;
  raise notice 'venta en gestion: % (stock % -> %)', (select sale_number from public.sales where id = v_sale), v_stock_before, v_stock_after;

  -- 6. Un segundo aviso aprobado no duplica nada
  v_result := private.storefront_apply_payment(v_order_id, 'transfer', null, 'approved', 'repetido',
    (v_order ->> 'total')::numeric, 'ARS', null, 'transferencia');
  if (v_result ->> 'applied')::boolean then raise exception 'FALLA: el pago se aplicó dos veces'; end if;
  raise notice 'pago repetido: ok';

  -- 7. Vencimiento: una reserva vencida libera el stock
  v_result := public.storefront_checkout_create(jsonb_build_object(
    'items', jsonb_build_array(jsonb_build_object('storefront_product_id', v_product.id, 'quantity', 1)),
    'customer', jsonb_build_object('name', 'Cliente que no paga', 'email', 'nopaga@example.com', 'phone', '3571000002'),
    'delivery', jsonb_build_object('kind', 'pickup'), 'payment_method', 'pickup',
    'access_token_hash', 'hash-vence'));
  update public.storefront_orders set reserved_until = now() - interval '1 minute'
  where id = (v_result ->> 'order_id')::uuid;
  update public.storefront_stock_reservations set expires_at = now() - interval '1 minute'
  where order_id = (v_result ->> 'order_id')::uuid;
  perform private.storefront_expire_orders();
  if (select status from public.storefront_orders where id = (v_result ->> 'order_id')::uuid) <> 'expired' then
    raise exception 'FALLA: el pedido no venció';
  end if;
  raise notice 'vencimiento: ok';

  -- 8. Monto distinto: no se aplica y queda para revisar
  v_result := public.storefront_checkout_create(jsonb_build_object(
    'items', jsonb_build_array(jsonb_build_object('storefront_product_id', v_product.id, 'quantity', 1)),
    'customer', jsonb_build_object('name', 'Monto raro', 'email', 'monto@example.com', 'phone', '3571000003'),
    'delivery', jsonb_build_object('kind', 'pickup'), 'payment_method', 'transfer',
    'access_token_hash', 'hash-monto'));
  v_order := private.storefront_apply_payment((v_result ->> 'order_id')::uuid, 'mercadopago', 'mp-prueba-1',
    'approved', 'accredited', 1, 'ARS', null, null);
  if (v_order ->> 'applied')::boolean or (select needs_attention from public.storefront_orders
      where id = (v_result ->> 'order_id')::uuid) is null then
    raise exception 'FALLA: un monto distinto se aplicó';
  end if;
  raise notice 'monto distinto: ok';

  select count(*) into v_count from public.storefront_outbox;
  raise notice 'mails en cola: %', v_count;
  raise notice 'tablero: %', (select jsonb_agg(row_to_json(t)) from (select kind, count(*) from public.storefront_outbox group by kind) t);
  raise notice 'TODAS LAS PRUEBAS PASARON';
end
$$;

rollback;

-- Restaurar las secuencias solo si nadie más las usó durante la prueba
do $$
begin
  perform 1;
end
$$;
select last_value as sale_seq_after from public.sale_number_seq \gset
select last_value as order_seq_after from private.storefront_order_number_seq \gset
select :'sale_seq_before' as antes, :'sale_seq_after' as despues;
select case when :sale_seq_after - :sale_seq_before = 1
  then setval('public.sale_number_seq', :sale_seq_before) end as venta_restaurada;
select case when :order_seq_after - :order_seq_before <= 4
  then setval('private.storefront_order_number_seq', :order_seq_before) end as pedido_restaurado;
