-- Lightweight, read-only listings for sections that do not need the complete
-- product payload. The underlying table remains unavailable to anonymous users.
create or replace function public.get_storefront_special_products(p_kind text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      to_jsonb(safe_product)
      order by safe_product.display_order,
        safe_product.published_at desc,
        safe_product.id
    ),
    '[]'::jsonb
  )
  from (
    select
      product.id,
      product.slug,
      product.sku,
      product.name,
      product.short_description,
      product.category_name,
      product.category_slug,
      product.brand,
      product.model,
      product.public_price,
      product.previous_price,
      product.condition,
      product.availability_label,
      product.primary_image_url,
      product.is_featured,
      product.is_new,
      product.is_offer,
      product.shipping_enabled,
      product.pickup_enabled,
      product.warranty,
      product.board_code,
      product.part_number,
      product.board_type,
      product.compatible_models,
      product.display_order,
      product.published_at
    from public.storefront_products as product
    where product.is_published
      and product.archived_at is null
      and product.public_price > 0
      and (
        (
          p_kind = 'boards'
          and (
            product.board_code is not null
            or product.category_slug = 'placas-de-tv'
          )
        )
        or (
          p_kind = 'refurbished'
          and product.condition in ('Reacondicionado', 'Usado')
        )
      )
  ) as safe_product;
$$;

revoke all on function public.get_storefront_special_products(text)
from public, anon, authenticated;
grant execute on function public.get_storefront_special_products(text)
to anon;
