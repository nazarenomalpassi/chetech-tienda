-- Keep commercial condition separate from product type and new-arrival flags.
update public.storefront_products
set condition = 'Usado',
    updated_at = now()
where condition = 'Usado seleccionado';

alter table public.storefront_products
  drop constraint if exists storefront_products_condition_check;

alter table public.storefront_products
  add constraint storefront_products_condition_check
  check (condition in ('Nuevo', 'Reacondicionado', 'Usado'));

-- These partial indexes match the public catalog predicate and its supported sorts.
create index if not exists storefront_products_catalog_category_condition_idx
  on public.storefront_products (category_slug, condition)
  where is_published and public_price > 0;

create index if not exists storefront_products_catalog_recent_idx
  on public.storefront_products (display_order, published_at desc, id)
  where is_published and public_price > 0;

create index if not exists storefront_products_catalog_price_idx
  on public.storefront_products (public_price, id)
  where is_published and public_price > 0;

create index if not exists storefront_products_catalog_name_idx
  on public.storefront_products (lower(name), id)
  where is_published and public_price > 0;

create index if not exists storefront_products_catalog_search_idx
  on public.storefront_products using gin (
    (lower(
      coalesce(name, '') || ' ' ||
      coalesce(sku, '') || ' ' ||
      coalesce(brand, '') || ' ' ||
      coalesce(model, '') || ' ' ||
      coalesce(board_code, '') || ' ' ||
      coalesce(part_number, '')
    )) extensions.gin_trgm_ops
  )
  where is_published and public_price > 0;

-- Private audit report: source products that cannot resolve a usable category.
create or replace view private.storefront_uncategorized_products
with (security_invoker = true)
as
select
  p.id,
  p.sku,
  p.name,
  p.category_id,
  p.is_active,
  p.stock,
  case
    when p.category_id is null then 'category_id nulo'
    when c.id is null then 'categoría inexistente'
    when nullif(btrim(c.name), '') is null then 'nombre de categoría vacío'
    when nullif(btrim(c.slug), '') is null then 'slug de categoría vacío'
  end as review_reason
from public.products p
left join public.categories c on c.id = p.category_id
where p.category_id is null
   or c.id is null
   or nullif(btrim(c.name), '') is null
   or nullif(btrim(c.slug), '') is null;

revoke all on private.storefront_uncategorized_products from public, anon, authenticated;

-- One public, read-only RPC returns the page and all filter facets in one round trip.
-- SECURITY INVOKER keeps storefront_products RLS in force for anonymous callers.
create or replace function public.get_storefront_catalog(
  p_category_slug text default null,
  p_condition text default null,
  p_search text default null,
  p_sort text default 'recent',
  p_page integer default 1,
  p_page_size integer default 24
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with params as (
    select
      nullif(btrim(coalesce(p_category_slug, '')), '') as category_slug,
      case
        when nullif(btrim(coalesce(p_condition, '')), '') in ('Nuevo', 'Reacondicionado', 'Usado')
          then nullif(btrim(coalesce(p_condition, '')), '')
        else null
      end as condition,
      nullif(btrim(left(coalesce(p_search, ''), 100)), '') as search,
      case
        when p_sort in ('recent', 'price-asc', 'price-desc', 'name') then p_sort
        else 'recent'
      end as sort,
      least(greatest(coalesce(p_page, 1), 1), 10000) as page,
      least(greatest(coalesce(p_page_size, 24), 1), 48) as page_size
  ),
  visible as (
    select sp.*
    from public.storefront_products sp
    where sp.is_published
      and sp.public_price > 0
  ),
  category_facets as (
    select
      v.category_name as name,
      v.category_slug as slug,
      count(*)::integer as product_count
    from visible v
    group by v.category_name, v.category_slug
  ),
  base_filtered as (
    select v.*
    from visible v
    cross join params p
    where (p.category_slug is null or v.category_slug = p.category_slug)
      and (
        p.search is null
        or lower(
          coalesce(v.name, '') || ' ' ||
          coalesce(v.sku, '') || ' ' ||
          coalesce(v.brand, '') || ' ' ||
          coalesce(v.model, '') || ' ' ||
          coalesce(v.board_code, '') || ' ' ||
          coalesce(v.part_number, '')
        ) like '%' || lower(p.search) || '%'
      )
  ),
  condition_facets as (
    select bf.condition as value, count(*)::integer as product_count
    from base_filtered bf
    group by bf.condition
  ),
  filtered as (
    select bf.*
    from base_filtered bf
    cross join params p
    where p.condition is null or bf.condition = p.condition
  ),
  ranked as (
    select
      f.*,
      row_number() over (
        order by
          case when p.sort = 'price-asc' then f.public_price end asc,
          case when p.sort = 'price-desc' then f.public_price end desc,
          case when p.sort = 'name' then lower(f.name) end asc,
          case when p.sort = 'recent' then f.display_order end asc,
          case when p.sort = 'recent' then f.published_at end desc,
          f.id
      ) as catalog_position
    from filtered f
    cross join params p
  ),
  paged as (
    select r.*
    from ranked r
    cross join params p
    where r.catalog_position > ((p.page - 1) * p.page_size)
      and r.catalog_position <= (p.page * p.page_size)
  ),
  totals as (
    select count(*)::integer as total from filtered
  )
  select jsonb_build_object(
    'products', coalesce((
      select jsonb_agg(to_jsonb(pg) - 'catalog_position' order by pg.catalog_position)
      from paged pg
    ), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(
        jsonb_build_object('name', cf.name, 'slug', cf.slug, 'count', cf.product_count)
        order by lower(cf.name), cf.slug
      )
      from category_facets cf
    ), '[]'::jsonb),
    'conditions', coalesce((
      select jsonb_agg(
        jsonb_build_object('value', c.value, 'count', c.product_count)
        order by case c.value when 'Nuevo' then 1 when 'Reacondicionado' then 2 else 3 end
      )
      from condition_facets c
    ), '[]'::jsonb),
    'total', t.total,
    'page', p.page,
    'pageSize', p.page_size,
    'totalPages', case when t.total = 0 then 0 else ceil(t.total::numeric / p.page_size)::integer end
  )
  from totals t
  cross join params p;
$$;

revoke all on function public.get_storefront_catalog(text, text, text, text, integer, integer)
  from public;
grant execute on function public.get_storefront_catalog(text, text, text, text, integer, integer)
  to anon, authenticated;

comment on function public.get_storefront_catalog(text, text, text, text, integer, integer)
  is 'Read-only, RLS-aware storefront catalog page with grouped category and condition facets.';
