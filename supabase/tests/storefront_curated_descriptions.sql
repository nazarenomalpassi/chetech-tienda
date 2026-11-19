-- Comprueba que las descripciones propias sobreviven a la sincronización con gestión.
-- Corre contra la base real dentro de una transacción que termina en ROLLBACK: no deja cambios.
\set ON_ERROR_STOP 1
\pset pager off

begin;

do $$
declare
  v_sku text;
  v_curated text;
  v_actual text;
  v_status text;
  v_count integer;
begin
  select count(*) into v_count from private.storefront_curated_descriptions;
  raise notice 'descripciones propias: %', v_count;

  select count(*) into v_count
  from private.storefront_curated_descriptions as curated
  where not private.storefront_description_is_valid(curated.description);
  if v_count <> 0 then
    raise exception 'Hay % descripciones propias fuera de las reglas de redacción', v_count;
  end if;

  select curated.sku, curated.description
    into v_sku, v_curated
  from private.storefront_curated_descriptions as curated
  join public.storefront_products as product on product.sku = curated.sku
  where product.description_status <> 'manually_reviewed'
    and curated.source_name = product.source_name
  order by curated.sku
  limit 1;

  if v_sku is null then
    raise notice 'sin productos para probar';
    return;
  end if;

  -- 1. La sincronización escribe el texto genérico del rubro: debe quedar el propio.
  update public.storefront_products as product
  set short_description = private.storefront_generated_description(product.source_name, product.category_name),
      description = private.storefront_generated_description(product.source_name, product.category_name),
      description_status = 'generated',
      description_generated_at = now()
  where product.sku = v_sku;

  select description into v_actual from public.storefront_products where sku = v_sku;
  if v_actual is distinct from v_curated then
    raise exception 'La sincronización pisó la descripción de %', v_sku;
  end if;
  raise notice 'ok: la sincronización no pisa la descripción de %', v_sku;

  -- 2. Si en gestión el código pasa a ser otro artículo, el texto propio deja de aplicarse.
  update public.storefront_products as product
  set source_name = product.source_name || ' (otro artículo)',
      description = private.storefront_generated_description(product.source_name, product.category_name)
  where product.sku = v_sku;

  select description into v_actual from public.storefront_products where sku = v_sku;
  if v_actual is not distinct from v_curated then
    raise exception 'El texto propio siguió aplicado a % después de cambiar el artículo', v_sku;
  end if;
  raise notice 'ok: al cambiar el artículo en gestión, el texto propio ya no se aplica';

  -- 3. Lo que el dueño edita a mano siempre gana.
  update public.storefront_products
  set description = 'Texto escrito a mano por el dueño.',
      short_description = 'Texto escrito a mano por el dueño.',
      description_status = 'manually_reviewed'
  where sku = v_sku;

  update public.storefront_products as product
  set description = case
        when product.description_status = 'manually_reviewed' then product.description
        else private.storefront_generated_description(product.source_name, product.category_name)
      end,
      updated_at = now()
  where product.sku = v_sku;

  select description, description_status into v_actual, v_status
  from public.storefront_products where sku = v_sku;
  if v_actual <> 'Texto escrito a mano por el dueño.' or v_status <> 'manually_reviewed' then
    raise exception 'Se pisó una descripción editada a mano en %', v_sku;
  end if;
  raise notice 'ok: la edición manual se respeta';
end;
$$;

rollback;
