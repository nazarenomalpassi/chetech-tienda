-- Expose only public image URLs through the existing anonymous product contract.
-- Storage paths, hashes and internal image metadata remain private.

create or replace function public.get_storefront_products(
  p_ids uuid[] default null,
  p_slugs text[] default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(to_jsonb(safe_product) order by safe_product.display_order, safe_product.published_at desc, safe_product.id),
    '[]'::jsonb
  )
  from (
    select
      sp.id, sp.slug, sp.sku, sp.name, sp.short_description, sp.description,
      sp.category_name, sp.category_slug, sp.brand, sp.model,
      sp.public_price, sp.previous_price, sp.condition, sp.availability_label,
      sp.primary_image_url, sp.specifications, sp.is_featured, sp.is_new,
      sp.is_offer, sp.shipping_enabled, sp.pickup_enabled, sp.board_code,
      sp.part_number, sp.board_type, sp.compatible_models, sp.display_order,
      sp.published_at,
      coalesce((
        select jsonb_agg(spi.public_url order by spi.is_primary desc, spi.sort_order, spi.id)
        from public.storefront_product_images spi
        where spi.storefront_product_id = sp.id
          and nullif(btrim(spi.public_url), '') is not null
      ), '[]'::jsonb) as image_urls
    from public.storefront_products sp
    where sp.is_published
      and sp.public_price > 0
      and (p_ids is null or sp.id = any(p_ids))
      and (p_slugs is null or sp.slug = any(p_slugs))
  ) safe_product;
$$;

revoke all on function public.get_storefront_products(uuid[], text[])
  from public, anon, authenticated;
grant execute on function public.get_storefront_products(uuid[], text[])
  to anon;

comment on function public.get_storefront_products(uuid[], text[])
  is 'Explicit public product contract including ordered public gallery URLs; excludes storage paths, hashes and internal notes.';
