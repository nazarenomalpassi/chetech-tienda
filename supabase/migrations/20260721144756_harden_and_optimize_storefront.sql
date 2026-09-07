-- Storefront hardening and query improvements identified in the July 2026 audit.

-- ---------------------------------------------------------------------------
-- Public catalog: consistent accent/separator-insensitive search and archived
-- product exclusion. The helper is immutable so the expression can be indexed.
-- ---------------------------------------------------------------------------

create or replace function private.normalize_storefront_search(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select regexp_replace(
    extensions.unaccent(lower(coalesce(p_value, ''))),
    '[^a-z0-9]+',
    '',
    'g'
  );
$$;

revoke all on function private.normalize_storefront_search(text)
from public, anon, authenticated;

create index if not exists storefront_products_catalog_search_normalized_idx
  on public.storefront_products using gin (
    private.normalize_storefront_search(
      coalesce(name, '') || ' ' ||
      coalesce(sku, '') || ' ' ||
      coalesce(brand, '') || ' ' ||
      coalesce(model, '') || ' ' ||
      coalesce(board_code, '') || ' ' ||
      coalesce(part_number, '')
    ) extensions.gin_trgm_ops
  )
  where is_published and archived_at is null and public_price > 0;

drop index if exists public.storefront_products_catalog_search_idx;

drop policy if exists storefront_products_public_read
  on public.storefront_products;
create policy storefront_products_public_read
  on public.storefront_products
  for select to anon
  using (is_published and archived_at is null and public_price > 0);

drop policy if exists storefront_images_public_read
  on public.storefront_product_images;
create policy storefront_images_public_read
  on public.storefront_product_images
  for select to anon
  using (
    exists (
      select 1
      from public.storefront_products as product
      where product.id = storefront_product_id
        and product.is_published
        and product.archived_at is null
        and product.public_price > 0
    )
  );

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
      product.description,
      product.category_name,
      product.category_slug,
      product.brand,
      product.model,
      product.public_price,
      product.previous_price,
      product.condition,
      product.availability_label,
      product.primary_image_url,
      product.specifications,
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
      product.published_at,
      coalesce((
        select jsonb_agg(
          image.public_url
          order by image.is_primary desc, image.sort_order, image.id
        )
        from public.storefront_product_images as image
        where image.storefront_product_id = product.id
          and nullif(btrim(image.public_url), '') is not null
      ), '[]'::jsonb) as image_urls
    from public.storefront_products as product
    where product.is_published
      and product.archived_at is null
      and product.public_price > 0
      and (p_ids is null or product.id = any(p_ids))
      and (p_slugs is null or product.slug = any(p_slugs))
  ) as safe_product;
$$;

revoke all on function public.get_storefront_products(uuid[], text[])
from public, anon, authenticated;
grant execute on function public.get_storefront_products(uuid[], text[])
to anon;

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
      case
        when nullif(btrim(coalesce(p_condition, '')), '') in (
          'Nuevo', 'Reacondicionado', 'Usado'
        ) then nullif(btrim(coalesce(p_condition, '')), '')
        else null
      end as condition,
      nullif(btrim(left(coalesce(p_search, ''), 100)), '') as search,
      case
        when p_sort in ('recent', 'price-asc', 'price-desc', 'name')
          then p_sort
        else 'recent'
      end as sort,
      least(greatest(coalesce(p_page, 1), 1), 10000) as page,
      least(greatest(coalesce(p_page_size, 24), 1), 48) as page_size
  ),
  visible as (
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
      product.display_order,
      product.published_at
    from public.storefront_products as product
    where product.is_published
      and product.archived_at is null
      and product.public_price > 0
  ),
  category_facets as (
    select
      visible_product.category_name as name,
      visible_product.category_slug as slug,
      count(*)::integer as product_count
    from visible as visible_product
    group by visible_product.category_name, visible_product.category_slug
  ),
  base_filtered as (
    select visible_product.*
    from visible as visible_product
    cross join params
    where (
      params.category_slug is null
      or visible_product.category_slug = params.category_slug
    )
      and (
        params.search is null
        or private.normalize_storefront_search(
          coalesce(visible_product.name, '') || ' ' ||
          coalesce(visible_product.sku, '') || ' ' ||
          coalesce(visible_product.brand, '') || ' ' ||
          coalesce(visible_product.model, '') || ' ' ||
          coalesce(visible_product.board_code, '') || ' ' ||
          coalesce(visible_product.part_number, '')
        ) like '%' || private.normalize_storefront_search(params.search) || '%'
      )
  ),
  condition_facets as (
    select
      base_product.condition as value,
      count(*)::integer as product_count
    from base_filtered as base_product
    group by base_product.condition
  ),
  filtered as (
    select base_product.*
    from base_filtered as base_product
    cross join params
    where params.condition is null or base_product.condition = params.condition
  ),
  ranked as (
    select
      filtered_product.*,
      row_number() over (
        order by
          case when params.sort = 'price-asc' then filtered_product.public_price end asc,
          case when params.sort = 'price-desc' then filtered_product.public_price end desc,
          case when params.sort = 'name' then lower(filtered_product.name) end asc,
          case when params.sort = 'recent' then filtered_product.display_order end asc,
          case when params.sort = 'recent' then filtered_product.published_at end desc,
          filtered_product.id
      ) as catalog_position
    from filtered as filtered_product
    cross join params
  ),
  paged as (
    select ranked_product.*
    from ranked as ranked_product
    cross join params
    where ranked_product.catalog_position > ((params.page - 1) * params.page_size)
      and ranked_product.catalog_position <= (params.page * params.page_size)
  ),
  totals as (
    select count(*)::integer as total from filtered
  )
  select jsonb_build_object(
    'products', coalesce((
      select jsonb_agg(
        to_jsonb(paged_product) - 'catalog_position'
        order by paged_product.catalog_position
      )
      from paged as paged_product
    ), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'name', category.name,
          'slug', category.slug,
          'count', category.product_count
        )
        order by lower(category.name), category.slug
      )
      from category_facets as category
    ), '[]'::jsonb),
    'conditions', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'value', condition.value,
          'count', condition.product_count
        )
        order by case condition.value
          when 'Nuevo' then 1
          when 'Reacondicionado' then 2
          else 3
        end
      )
      from condition_facets as condition
    ), '[]'::jsonb),
    'total', totals.total,
    'page', params.page,
    'pageSize', params.page_size,
    'totalPages', case
      when totals.total = 0 then 0
      else ceil(totals.total::numeric / params.page_size)::integer
    end
  )
  from totals
  cross join params;
$$;

revoke all on function public.get_storefront_catalog(
  text, text, text, text, integer, integer
) from public, anon, authenticated;
grant execute on function public.get_storefront_catalog(
  text, text, text, text, integer, integer
) to anon;

-- A source-system update must never republish a product an administrator chose
-- to archive.
create or replace function private.sync_storefront_product_from_source()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_category_name text;
  v_category_slug text;
  v_description text;
begin
  select
    coalesce(nullif(btrim(category.name), ''), 'Otros'),
    coalesce(nullif(btrim(category.slug), ''), 'otros')
  into v_category_name, v_category_slug
  from public.categories as category
  where category.id = new.category_id;

  v_category_name := coalesce(v_category_name, 'Otros');
  v_category_slug := coalesce(v_category_slug, 'otros');

  if nullif(btrim(new.name), '') is not null
     and nullif(btrim(new.sku), '') is not null
     and new.sale_price > 0
     and new.stock > 0
     and new.is_active then
    v_description := private.storefront_generated_description(
      new.name,
      v_category_name
    );

    insert into public.storefront_products (
      product_id,
      slug,
      sku,
      source_name,
      name,
      name_status,
      short_description,
      description,
      description_status,
      description_generated_at,
      category_name,
      category_slug,
      public_price,
      availability_label,
      is_published,
      published_at
    ) values (
      new.id,
      private.storefront_slugify(new.name) || '-' || private.storefront_slugify(new.sku),
      new.sku,
      new.name,
      new.name,
      'pending_review',
      v_description,
      v_description,
      'generated',
      now(),
      v_category_name,
      v_category_slug,
      new.sale_price,
      case
        when new.stock <= greatest(new.min_stock, 1) then 'Últimas unidades'
        else 'Disponible'
      end,
      true,
      now()
    )
    on conflict (sku) do update set
      product_id = excluded.product_id,
      source_name = excluded.source_name,
      name = case
        when public.storefront_products.name_status = 'manually_reviewed'
          then public.storefront_products.name
        else excluded.name
      end,
      name_status = case
        when public.storefront_products.name_status = 'manually_reviewed'
          then public.storefront_products.name_status
        else 'pending_review'
      end,
      name_reviewed_at = case
        when public.storefront_products.name_status = 'manually_reviewed'
          then public.storefront_products.name_reviewed_at
        else null
      end,
      category_name = excluded.category_name,
      category_slug = excluded.category_slug,
      public_price = excluded.public_price,
      availability_label = excluded.availability_label,
      is_published = public.storefront_products.archived_at is null,
      published_at = coalesce(
        public.storefront_products.published_at,
        excluded.published_at
      ),
      short_description = case
        when public.storefront_products.description_status = 'manually_reviewed'
          then public.storefront_products.short_description
        else excluded.short_description
      end,
      description = case
        when public.storefront_products.description_status = 'manually_reviewed'
          then public.storefront_products.description
        else excluded.description
      end,
      description_status = case
        when public.storefront_products.description_status = 'manually_reviewed'
          then public.storefront_products.description_status
        else 'generated'
      end,
      description_generated_at = case
        when public.storefront_products.description_status = 'manually_reviewed'
          then public.storefront_products.description_generated_at
        else now()
      end,
      updated_at = now();
  else
    update public.storefront_products
    set
      source_name = new.name,
      availability_label = 'Sin stock',
      is_published = false,
      updated_at = now()
    where product_id = new.id;
  end if;

  return new;
end;
$$;

revoke all on function private.sync_storefront_product_from_source()
from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Legal-request intake: callers using the public key must also prove they came
-- through the server endpoint. Only a one-way hash of the server secret is
-- stored in Postgres.
-- ---------------------------------------------------------------------------

create table if not exists private.consumer_request_intake_secrets (
  singleton boolean primary key default true check (singleton),
  secret_hash text not null check (secret_hash ~ '^[a-f0-9]{64}$'),
  rotated_at timestamptz not null default now()
);

revoke all on private.consumer_request_intake_secrets
from public, anon, authenticated;

insert into private.consumer_request_intake_secrets (
  singleton,
  secret_hash,
  rotated_at
) values (
  true,
  'fbd046d74504df19f3588186c9991f8b3135f2cae0b8be74ce447a45cf55f0be',
  now()
)
on conflict (singleton) do update set
  secret_hash = excluded.secret_hash,
  rotated_at = excluded.rotated_at;

create or replace function public.submit_consumer_request(
  p_request_type text,
  p_first_name text,
  p_last_name text,
  p_contact text,
  p_preferred_channel text,
  p_server_token text,
  p_order_reference text default null,
  p_approximate_date text default null,
  p_product text default null,
  p_reason text default null,
  p_privacy_right text default null,
  p_fingerprint_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_reference text;
  v_contact_hash text;
  v_date date;
begin
  if not exists (
    select 1
    from private.consumer_request_intake_secrets as intake_secret
    where intake_secret.singleton
      and intake_secret.secret_hash = encode(
        extensions.digest(coalesce(p_server_token, ''), 'sha256'),
        'hex'
      )
  ) then
    raise exception 'server_authorization_required' using errcode = '42501';
  end if;

  p_request_type := btrim(coalesce(p_request_type, ''));
  p_first_name := btrim(coalesce(p_first_name, ''));
  p_last_name := btrim(coalesce(p_last_name, ''));
  p_contact := btrim(coalesce(p_contact, ''));
  p_preferred_channel := btrim(coalesce(p_preferred_channel, ''));
  p_order_reference := nullif(btrim(coalesce(p_order_reference, '')), '');
  p_product := nullif(btrim(coalesce(p_product, '')), '');
  p_reason := nullif(btrim(coalesce(p_reason, '')), '');
  p_privacy_right := nullif(btrim(coalesce(p_privacy_right, '')), '');
  p_fingerprint_hash := lower(btrim(coalesce(p_fingerprint_hash, '')));

  if p_request_type not in ('withdrawal', 'privacy')
     or char_length(p_first_name) not between 1 and 80
     or char_length(p_last_name) not between 1 and 80
     or char_length(p_contact) not between 3 and 160
     or p_preferred_channel not in ('email', 'whatsapp', 'phone')
     or p_fingerprint_hash !~ '^[a-f0-9]{64}$'
     or char_length(coalesce(p_order_reference, '')) > 80
     or char_length(coalesce(p_product, '')) > 200
     or char_length(coalesce(p_reason, '')) > 1000 then
    raise exception 'invalid_request' using errcode = '22023';
  end if;

  if p_request_type = 'withdrawal' and p_product is null then
    raise exception 'invalid_request' using errcode = '22023';
  end if;
  if p_request_type = 'privacy'
     and (
       p_privacy_right is null
       or p_privacy_right not in (
         'access', 'rectification', 'deletion', 'information', 'consent'
       )
       or p_reason is null
     ) then
    raise exception 'invalid_request' using errcode = '22023';
  end if;
  if p_request_type = 'withdrawal' then
    p_privacy_right := null;
  end if;

  if nullif(btrim(coalesce(p_approximate_date, '')), '') is not null then
    begin
      v_date := p_approximate_date::date;
    exception when others then
      raise exception 'invalid_request' using errcode = '22023';
    end;
  end if;

  v_contact_hash := encode(
    extensions.digest(lower(p_contact), 'sha256'),
    'hex'
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('fingerprint:' || p_fingerprint_hash, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('contact:' || v_contact_hash, 0)
  );

  if (
    select count(*)
    from private.consumer_requests
    where fingerprint_hash = p_fingerprint_hash
      and created_at > now() - interval '15 minutes'
  ) >= 5 or (
    select count(*)
    from private.consumer_requests
    where contact_hash = v_contact_hash
      and created_at > now() - interval '60 minutes'
  ) >= 3 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  v_reference := format(
    'CH-%s-%s',
    to_char(now(), 'YYYY'),
    lpad(nextval('private.consumer_request_reference_seq')::text, 8, '0')
  );
  insert into private.consumer_requests (
    public_reference,
    request_type,
    first_name,
    last_name,
    contact,
    contact_hash,
    preferred_channel,
    order_reference,
    approximate_date,
    product,
    reason,
    privacy_right,
    fingerprint_hash
  ) values (
    v_reference,
    p_request_type,
    p_first_name,
    p_last_name,
    p_contact,
    v_contact_hash,
    p_preferred_channel,
    p_order_reference,
    v_date,
    p_product,
    p_reason,
    p_privacy_right,
    p_fingerprint_hash
  ) returning id into v_id;

  insert into private.consumer_request_events (
    request_id,
    event_type,
    to_status
  ) values (
    v_id,
    'received',
    'received'
  );

  return jsonb_build_object('reference', v_reference);
end;
$$;

revoke all on function public.submit_consumer_request(
  text, text, text, text, text, text, text, text, text, text, text
) from public, anon, authenticated;
revoke all on function public.submit_consumer_request(
  text, text, text, text, text, text, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.submit_consumer_request(
  text, text, text, text, text, text, text, text, text, text, text, text
) to anon;

-- ---------------------------------------------------------------------------
-- Persistent carts: replace the delete/insert sequence from the API with one
-- authenticated database transaction.
-- ---------------------------------------------------------------------------

create or replace function private.sync_storefront_cart(p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  active_cart_id uuid;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.profiles
    where id = current_user_id and account_status = 'active'
  ) then
    raise exception 'account_not_active' using errcode = '42501';
  end if;

  if coalesce(jsonb_typeof(p_items), '') <> 'array' then
    raise exception 'invalid_cart' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 25
     or exists (
       select 1
       from jsonb_array_elements(p_items) as element
       where jsonb_typeof(element) <> 'object'
     ) then
    raise exception 'invalid_cart' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_items) as requested(id uuid, quantity integer)
    where requested.id is null or requested.quantity not between 1 and 99
  ) or (
    select count(*)
    from jsonb_to_recordset(p_items) as requested(id uuid, quantity integer)
  ) <> (
    select count(distinct requested.id)
    from jsonb_to_recordset(p_items) as requested(id uuid, quantity integer)
  ) then
    raise exception 'invalid_cart_items' using errcode = '22023';
  end if;

  if (
    select count(*)
    from public.storefront_products as product
    join jsonb_to_recordset(p_items) as requested(id uuid, quantity integer)
      on requested.id = product.id
    where product.is_published
      and product.archived_at is null
      and product.public_price > 0
      and product.availability_label <> 'Sin stock'
  ) <> jsonb_array_length(p_items) then
    raise exception 'products_changed_or_unavailable' using errcode = 'P0001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('cart:' || current_user_id::text, 0)
  );

  select cart.id into active_cart_id
  from public.storefront_carts as cart
  where cart.user_id = current_user_id and cart.status = 'active'
  for update;

  if active_cart_id is null then
    insert into public.storefront_carts (user_id)
    values (current_user_id)
    returning id into active_cart_id;
  end if;

  delete from public.storefront_cart_items
  where cart_id = active_cart_id;

  insert into public.storefront_cart_items (
    cart_id,
    storefront_product_id,
    quantity
  )
  select active_cart_id, requested.id, requested.quantity
  from jsonb_to_recordset(p_items) as requested(id uuid, quantity integer);

  update public.storefront_carts
  set
    last_activity_at = now(),
    abandoned_at = null,
    updated_at = now()
  where id = active_cart_id;

  return jsonb_build_object(
    'cart_id', active_cart_id,
    'item_count', jsonb_array_length(p_items)
  );
end;
$$;

create or replace function public.sync_storefront_cart(p_items jsonb)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.sync_storefront_cart(p_items);
$$;

revoke all on function private.sync_storefront_cart(jsonb)
from public, anon;
grant execute on function private.sync_storefront_cart(jsonb)
to authenticated;
revoke all on function public.sync_storefront_cart(jsonb)
from public, anon;
grant execute on function public.sync_storefront_cart(jsonb)
to authenticated;

-- ---------------------------------------------------------------------------
-- Admin image registration/deletion remains consistent even when a primary
-- image changes. Storage cleanup is performed by the server after DB success.
-- ---------------------------------------------------------------------------

create or replace function private.register_storefront_product_image(
  p_product_id uuid,
  p_storage_path text,
  p_public_url text,
  p_alt_text text,
  p_is_primary boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin_id uuid := auth.uid();
  image_id uuid;
  next_sort_order integer;
  make_primary boolean;
begin
  if admin_id is null or not (select private.is_admin()) then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_storage_path, '')), '') is null
     or nullif(btrim(coalesce(p_public_url, '')), '') is null
     or char_length(btrim(coalesce(p_alt_text, ''))) not between 1 and 200 then
    raise exception 'invalid_image' using errcode = '22023';
  end if;

  perform 1
  from public.storefront_products
  where id = p_product_id
  for update;
  if not found then
    raise exception 'product_not_found' using errcode = 'P0002';
  end if;

  select coalesce(max(sort_order) + 1, 0),
    coalesce(bool_or(is_primary), false)
  into next_sort_order, make_primary
  from public.storefront_product_images
  where storefront_product_id = p_product_id;
  make_primary := coalesce(p_is_primary, false) or not make_primary;

  insert into public.storefront_product_images (
    storefront_product_id,
    storage_path,
    public_url,
    alt_text,
    sort_order,
    is_primary
  ) values (
    p_product_id,
    btrim(p_storage_path),
    btrim(p_public_url),
    btrim(p_alt_text),
    next_sort_order,
    false
  ) returning id into image_id;

  if make_primary then
    update public.storefront_product_images
    set is_primary = (id = image_id)
    where storefront_product_id = p_product_id;
    update public.storefront_products
    set primary_image_url = btrim(p_public_url), updated_at = now()
    where id = p_product_id;
  end if;

  insert into public.storefront_admin_logs (
    admin_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  ) values (
    admin_id,
    'product.image_added',
    'storefront_product',
    p_product_id::text,
    jsonb_build_object('image_id', image_id, 'primary', make_primary)
  );

  return image_id;
end;
$$;

create or replace function public.register_storefront_product_image(
  p_product_id uuid,
  p_storage_path text,
  p_public_url text,
  p_alt_text text,
  p_is_primary boolean default false
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.register_storefront_product_image(
    p_product_id,
    p_storage_path,
    p_public_url,
    p_alt_text,
    p_is_primary
  );
$$;

revoke all on function private.register_storefront_product_image(
  uuid, text, text, text, boolean
) from public, anon;
grant execute on function private.register_storefront_product_image(
  uuid, text, text, text, boolean
) to authenticated;
revoke all on function public.register_storefront_product_image(
  uuid, text, text, text, boolean
) from public, anon;
grant execute on function public.register_storefront_product_image(
  uuid, text, text, text, boolean
) to authenticated;

create or replace function private.delete_storefront_product_image(
  p_image_id uuid,
  p_product_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin_id uuid := auth.uid();
  removed_image public.storefront_product_images;
  replacement_image public.storefront_product_images;
begin
  if admin_id is null or not (select private.is_admin()) then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  perform 1
  from public.storefront_products
  where id = p_product_id
  for update;
  if not found then
    raise exception 'product_not_found' using errcode = 'P0002';
  end if;

  delete from public.storefront_product_images
  where id = p_image_id and storefront_product_id = p_product_id
  returning * into removed_image;
  if removed_image.id is null then
    raise exception 'image_not_found' using errcode = 'P0002';
  end if;

  if removed_image.is_primary then
    select * into replacement_image
    from public.storefront_product_images
    where storefront_product_id = p_product_id
    order by sort_order, id
    limit 1
    for update;

    if replacement_image.id is not null then
      update public.storefront_product_images
      set is_primary = true
      where id = replacement_image.id;
    end if;

    update public.storefront_products
    set
      primary_image_url = replacement_image.public_url,
      updated_at = now()
    where id = p_product_id;
  end if;

  insert into public.storefront_admin_logs (
    admin_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  ) values (
    admin_id,
    'product.image_deleted',
    'storefront_product',
    p_product_id::text,
    jsonb_build_object('image_id', p_image_id)
  );

  return jsonb_build_object(
    'storage_path', removed_image.storage_path,
    'replacement_url', replacement_image.public_url
  );
end;
$$;

create or replace function public.delete_storefront_product_image(
  p_image_id uuid,
  p_product_id uuid
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.delete_storefront_product_image(p_image_id, p_product_id);
$$;

revoke all on function private.delete_storefront_product_image(uuid, uuid)
from public, anon;
grant execute on function private.delete_storefront_product_image(uuid, uuid)
to authenticated;
revoke all on function public.delete_storefront_product_image(uuid, uuid)
from public, anon;
grant execute on function public.delete_storefront_product_image(uuid, uuid)
to authenticated;

-- Foreign-key indexes used during deletes, conversions and audit lookups.
create index if not exists storefront_admin_logs_admin_user_idx
  on public.storefront_admin_logs (admin_user_id);
create index if not exists storefront_cart_items_product_full_idx
  on public.storefront_cart_items (storefront_product_id);
create index if not exists storefront_carts_converted_order_idx
  on public.storefront_carts (converted_order_id);
create index if not exists storefront_order_items_source_product_idx
  on public.storefront_order_items (product_id);
create index if not exists storefront_order_history_changed_by_idx
  on public.storefront_order_status_history (changed_by);
create index if not exists storefront_orders_shipping_address_idx
  on public.storefront_orders (shipping_address_id);
