-- Stage 1 of the public-data cutover. Adds explicit, read-only RPC contracts
-- without revoking the legacy direct SELECT yet. The application must deploy
-- against these functions before the follow-up revoke migration is applied.

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
  select coalesce(jsonb_agg(to_jsonb(safe_product) order by safe_product.display_order, safe_product.published_at desc, safe_product.id), '[]'::jsonb)
  from (
    select
      sp.id, sp.slug, sp.sku, sp.name, sp.short_description, sp.description,
      sp.category_name, sp.category_slug, sp.brand, sp.model,
      sp.public_price, sp.previous_price, sp.condition, sp.availability_label,
      sp.primary_image_url, sp.specifications, sp.is_featured, sp.is_new,
      sp.is_offer, sp.shipping_enabled, sp.pickup_enabled, sp.board_code,
      sp.part_number, sp.board_type, sp.compatible_models, sp.display_order,
      sp.published_at
    from public.storefront_products sp
    where sp.is_published and sp.public_price > 0
      and (p_ids is null or sp.id = any(p_ids))
      and (p_slugs is null or sp.slug = any(p_slugs))
  ) safe_product;
$$;

revoke all on function public.get_storefront_products(uuid[],text[]) from public, anon, authenticated;
grant execute on function public.get_storefront_products(uuid[],text[]) to anon;

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
security definer
set search_path = ''
as $$
  with params as (
    select
      nullif(btrim(coalesce(p_category_slug, '')), '') as category_slug,
      case when nullif(btrim(coalesce(p_condition, '')), '') in ('Nuevo','Reacondicionado','Usado') then nullif(btrim(coalesce(p_condition, '')), '') else null end as condition,
      nullif(btrim(left(coalesce(p_search, ''), 100)), '') as search,
      case when p_sort in ('recent','price-asc','price-desc','name') then p_sort else 'recent' end as sort,
      least(greatest(coalesce(p_page,1),1),10000) as page,
      least(greatest(coalesce(p_page_size,24),1),48) as page_size
  ),
  visible as (
    select
      sp.id, sp.slug, sp.sku, sp.name, sp.short_description, sp.description,
      sp.category_name, sp.category_slug, sp.brand, sp.model,
      sp.public_price, sp.previous_price, sp.condition, sp.availability_label,
      sp.primary_image_url, sp.specifications, sp.is_featured, sp.is_new,
      sp.is_offer, sp.shipping_enabled, sp.pickup_enabled, sp.board_code,
      sp.part_number, sp.board_type, sp.compatible_models, sp.display_order,
      sp.published_at
    from public.storefront_products sp
    where sp.is_published and sp.public_price > 0
  ),
  category_facets as (
    select v.category_name as name, v.category_slug as slug, count(*)::integer as product_count
    from visible v group by v.category_name,v.category_slug
  ),
  base_filtered as (
    select v.* from visible v cross join params p
    where (p.category_slug is null or v.category_slug = p.category_slug)
      and (p.search is null or lower(coalesce(v.name,'')||' '||coalesce(v.sku,'')||' '||coalesce(v.brand,'')||' '||coalesce(v.model,'')||' '||coalesce(v.board_code,'')||' '||coalesce(v.part_number,'')) like '%'||lower(p.search)||'%')
  ),
  condition_facets as (
    select bf.condition as value,count(*)::integer as product_count from base_filtered bf group by bf.condition
  ),
  filtered as (
    select bf.* from base_filtered bf cross join params p where p.condition is null or bf.condition = p.condition
  ),
  ranked as (
    select f.*,row_number() over (order by
      case when p.sort='price-asc' then f.public_price end asc,
      case when p.sort='price-desc' then f.public_price end desc,
      case when p.sort='name' then lower(f.name) end asc,
      case when p.sort='recent' then f.display_order end asc,
      case when p.sort='recent' then f.published_at end desc,
      f.id) as catalog_position
    from filtered f cross join params p
  ),
  paged as (
    select r.* from ranked r cross join params p
    where r.catalog_position > ((p.page-1)*p.page_size) and r.catalog_position <= (p.page*p.page_size)
  ),
  totals as (select count(*)::integer as total from filtered)
  select jsonb_build_object(
    'products',coalesce((select jsonb_agg(to_jsonb(pg)-'catalog_position' order by pg.catalog_position) from paged pg),'[]'::jsonb),
    'categories',coalesce((select jsonb_agg(jsonb_build_object('name',cf.name,'slug',cf.slug,'count',cf.product_count) order by lower(cf.name),cf.slug) from category_facets cf),'[]'::jsonb),
    'conditions',coalesce((select jsonb_agg(jsonb_build_object('value',c.value,'count',c.product_count) order by case c.value when 'Nuevo' then 1 when 'Reacondicionado' then 2 else 3 end) from condition_facets c),'[]'::jsonb),
    'total',t.total,'page',p.page,'pageSize',p.page_size,
    'totalPages',case when t.total=0 then 0 else ceil(t.total::numeric/p.page_size)::integer end
  ) from totals t cross join params p;
$$;

revoke all on function public.get_storefront_catalog(text,text,text,text,integer,integer) from public, anon, authenticated;
grant execute on function public.get_storefront_catalog(text,text,text,text,integer,integer) to anon;

comment on function public.get_storefront_products(uuid[],text[]) is 'Explicit public product contract; excludes source IDs, review state and internal notes.';
comment on function public.get_storefront_catalog(text,text,text,text,integer,integer) is 'Explicit paginated public catalog contract; excludes internal columns.';
