-- Chetech storefront accounts, customer data, orders and administrative audit.
-- This migration is intentionally additive and does not change the operational
-- sales, repairs, inventory or cash tables used by the in-store system.

begin;

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Profiles and roles
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists email text,
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists phone text,
  add column if not exists email_verified boolean not null default false,
  add column if not exists marketing_consent boolean not null default false,
  add column if not exists marketing_consent_at timestamptz,
  add column if not exists terms_accepted_version text,
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists privacy_accepted_version text,
  add column if not exists privacy_accepted_at timestamptz,
  add column if not exists account_status text not null default 'active',
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists last_login_at timestamptz,
  add column if not exists deactivated_at timestamptz;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'tecnico', 'customer', 'editor', 'support', 'staff'));

alter table public.profiles drop constraint if exists profiles_account_status_check;
alter table public.profiles
  add constraint profiles_account_status_check
  check (account_status in ('active', 'disabled', 'deletion_requested'));

alter table public.profiles drop constraint if exists profiles_names_length_check;
alter table public.profiles
  add constraint profiles_names_length_check
  check (
    char_length(coalesce(first_name, '')) <= 80
    and char_length(coalesce(last_name, '')) <= 80
    and char_length(coalesce(phone, '')) <= 40
  );

create unique index if not exists profiles_email_lower_idx
  on public.profiles (lower(email)) where email is not null;
create index if not exists profiles_role_created_at_idx
  on public.profiles (role, created_at desc);

-- The legacy self-insert policy allowed a signed-in user to create a technician
-- profile. New profiles are now created exclusively by the auth.users trigger.
drop policy if exists profiles_insert_by_role on public.profiles;

update public.profiles as profile
set
  email = auth_user.email,
  email_verified = auth_user.email_confirmed_at is not null,
  last_login_at = auth_user.last_sign_in_at,
  updated_at = now()
from auth.users as auth_user
where auth_user.id = profile.id
  and (
    profile.email is distinct from auth_user.email
    or profile.email_verified is distinct from (auth_user.email_confirmed_at is not null)
    or profile.last_login_at is distinct from auth_user.last_sign_in_at
  );

create or replace function private.current_app_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select profile.role
  from public.profiles as profile
  where profile.id = (select auth.uid())
    and profile.account_status = 'active';
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select private.current_app_role()) = 'admin', false);
$$;

create or replace function private.can_access_operations()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select private.current_app_role()) in ('admin', 'tecnico'), false);
$$;

create or replace function private.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_role text := case
    when new.raw_app_meta_data ->> 'role' in ('admin', 'tecnico', 'customer', 'editor', 'support', 'staff')
      then new.raw_app_meta_data ->> 'role'
    else 'customer'
  end;
  resolved_first_name text := nullif(left(trim(coalesce(new.raw_user_meta_data ->> 'first_name', '')), 80), '');
  resolved_last_name text := nullif(left(trim(coalesce(new.raw_user_meta_data ->> 'last_name', '')), 80), '');
  resolved_full_name text;
begin
  resolved_full_name := nullif(trim(concat_ws(' ', resolved_first_name, resolved_last_name)), '');

  if tg_op = 'INSERT' then
    insert into public.profiles (
      id, email, first_name, last_name, full_name, role, email_verified,
      marketing_consent, marketing_consent_at,
      terms_accepted_version, terms_accepted_at,
      privacy_accepted_version, privacy_accepted_at,
      last_login_at, created_at, updated_at
    ) values (
      new.id,
      new.email,
      resolved_first_name,
      resolved_last_name,
      coalesce(resolved_full_name, new.email, 'Cliente'),
      resolved_role,
      new.email_confirmed_at is not null,
      coalesce(new.raw_user_meta_data ->> 'marketing_consent', 'false') = 'true',
      case when coalesce(new.raw_user_meta_data ->> 'marketing_consent', 'false') = 'true' then now() end,
      nullif(left(trim(coalesce(new.raw_user_meta_data ->> 'terms_version', '')), 40), ''),
      case when nullif(trim(coalesce(new.raw_user_meta_data ->> 'terms_version', '')), '') is not null then now() end,
      nullif(left(trim(coalesce(new.raw_user_meta_data ->> 'privacy_version', '')), 40), ''),
      case when nullif(trim(coalesce(new.raw_user_meta_data ->> 'privacy_version', '')), '') is not null then now() end,
      new.last_sign_in_at,
      now(),
      now()
    )
    on conflict (id) do update set
      email = excluded.email,
      email_verified = excluded.email_verified,
      last_login_at = excluded.last_login_at,
      updated_at = now();
  else
    update public.profiles as profile
    set
      email = new.email,
      email_verified = new.email_confirmed_at is not null,
      last_login_at = new.last_sign_in_at,
      role = case
        when new.raw_app_meta_data ->> 'role' in ('admin', 'tecnico', 'customer', 'editor', 'support', 'staff')
          then new.raw_app_meta_data ->> 'role'
        else profile.role
      end,
      updated_at = now()
    where profile.id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_updated_storefront_profile on auth.users;
create trigger on_auth_user_updated_storefront_profile
after update of email, email_confirmed_at, last_sign_in_at, raw_app_meta_data on auth.users
for each row execute function private.handle_new_user_profile();

revoke all on function private.current_app_role() from public, anon;
revoke all on function private.is_admin() from public, anon;
revoke all on function private.can_access_operations() from public, anon;
revoke all on function private.handle_new_user_profile() from public, anon, authenticated;
grant execute on function private.current_app_role() to authenticated;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.can_access_operations() to authenticated;

create or replace function private.update_my_storefront_profile(
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_marketing_consent boolean
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  updated_profile public.profiles;
  clean_first_name text := nullif(left(trim(coalesce(p_first_name, '')), 80), '');
  clean_last_name text := nullif(left(trim(coalesce(p_last_name, '')), 80), '');
  clean_phone text := nullif(left(trim(coalesce(p_phone, '')), 40), '');
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if clean_first_name is null or clean_last_name is null then
    raise exception 'first_and_last_name_required' using errcode = '22023';
  end if;

  update public.profiles as profile
  set
    first_name = clean_first_name,
    last_name = clean_last_name,
    full_name = concat_ws(' ', clean_first_name, clean_last_name),
    phone = clean_phone,
    marketing_consent = coalesce(p_marketing_consent, false),
    marketing_consent_at = case
      when coalesce(p_marketing_consent, false) and not profile.marketing_consent then now()
      when not coalesce(p_marketing_consent, false) then null
      else profile.marketing_consent_at
    end,
    updated_at = now()
  where profile.id = current_user_id
    and profile.account_status = 'active'
  returning profile.* into updated_profile;

  if updated_profile.id is null then
    raise exception 'profile_not_available' using errcode = '42501';
  end if;
  return updated_profile;
end;
$$;

create or replace function public.update_my_storefront_profile(
  p_first_name text,
  p_last_name text,
  p_phone text default null,
  p_marketing_consent boolean default false
)
returns public.profiles
language sql
security invoker
set search_path = ''
as $$
  select private.update_my_storefront_profile(
    p_first_name, p_last_name, p_phone, p_marketing_consent
  );
$$;

revoke all on function private.update_my_storefront_profile(text,text,text,boolean) from public, anon;
grant execute on function private.update_my_storefront_profile(text,text,text,boolean) to authenticated;
revoke all on function public.update_my_storefront_profile(text,text,text,boolean) from public, anon;
grant execute on function public.update_my_storefront_profile(text,text,text,boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Customer addresses
-- ---------------------------------------------------------------------------

create table if not exists public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null default 'Casa',
  recipient_name text not null,
  phone text not null,
  street text not null,
  street_number text not null,
  floor text,
  apartment text,
  city text not null,
  province text not null,
  postal_code text not null,
  additional_info text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_addresses_content_check check (
    char_length(trim(label)) between 1 and 40
    and char_length(trim(recipient_name)) between 1 and 160
    and char_length(trim(phone)) between 1 and 40
    and char_length(trim(street)) between 1 and 160
    and char_length(trim(street_number)) between 1 and 30
    and char_length(trim(city)) between 1 and 100
    and char_length(trim(province)) between 1 and 100
    and char_length(trim(postal_code)) between 1 and 20
    and char_length(coalesce(additional_info, '')) <= 500
  )
);

create index if not exists customer_addresses_user_created_idx
  on public.customer_addresses (user_id, created_at desc);
create unique index if not exists customer_addresses_one_default_idx
  on public.customer_addresses (user_id) where is_default;

alter table public.customer_addresses enable row level security;

create policy customer_addresses_select_own_or_admin on public.customer_addresses
for select to authenticated
using ((select auth.uid()) = user_id or (select private.is_admin()));
create policy customer_addresses_insert_own on public.customer_addresses
for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy customer_addresses_update_own_or_admin on public.customer_addresses
for update to authenticated
using ((select auth.uid()) = user_id or (select private.is_admin()))
with check ((select auth.uid()) = user_id or (select private.is_admin()));
create policy customer_addresses_delete_own_or_admin on public.customer_addresses
for delete to authenticated
using ((select auth.uid()) = user_id or (select private.is_admin()));

revoke all on public.customer_addresses from public, anon;
grant select, insert, update, delete on public.customer_addresses to authenticated;

create or replace function private.set_storefront_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.set_storefront_updated_at() from public, anon, authenticated;

drop trigger if exists customer_addresses_set_updated_at on public.customer_addresses;
create trigger customer_addresses_set_updated_at
before update on public.customer_addresses
for each row execute function private.set_storefront_updated_at();

create or replace function private.set_my_default_address(p_address_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.customer_addresses
    where id = p_address_id and user_id = current_user_id
  ) then
    raise exception 'address_not_found' using errcode = 'P0002';
  end if;
  update public.customer_addresses set is_default = false
  where user_id = current_user_id and is_default;
  update public.customer_addresses set is_default = true
  where id = p_address_id and user_id = current_user_id;
end;
$$;

create or replace function public.set_my_default_address(p_address_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$ select private.set_my_default_address(p_address_id); $$;

revoke all on function private.set_my_default_address(uuid) from public, anon;
grant execute on function private.set_my_default_address(uuid) to authenticated;
revoke all on function public.set_my_default_address(uuid) from public, anon;
grant execute on function public.set_my_default_address(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Orders and immutable item snapshots
-- ---------------------------------------------------------------------------

create sequence if not exists private.storefront_order_number_seq start 1;
revoke all on sequence private.storefront_order_number_seq from public, anon, authenticated;

create table if not exists public.storefront_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  user_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'pending_whatsapp',
  delivery_method text not null,
  shipping_address_id uuid references public.customer_addresses(id) on delete set null,
  shipping_address_snapshot jsonb,
  customer_name_snapshot text not null,
  customer_email_snapshot text not null,
  customer_phone_snapshot text not null,
  subtotal numeric(14,2) not null,
  shipping_cost numeric(14,2) not null default 0,
  total numeric(14,2) not null,
  currency text not null default 'ARS',
  customer_notes text,
  admin_notes text,
  source text not null default 'storefront_whatsapp',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  constraint storefront_orders_status_check check (status in (
    'pending_whatsapp', 'pending_confirmation', 'confirmed', 'awaiting_payment',
    'paid', 'preparing', 'shipped', 'ready_for_pickup', 'completed', 'cancelled'
  )),
  constraint storefront_orders_delivery_check check (delivery_method in ('shipping', 'pickup', 'coordinate')),
  constraint storefront_orders_amounts_check check (
    subtotal >= 0 and shipping_cost >= 0 and total = subtotal + shipping_cost
  ),
  constraint storefront_orders_currency_check check (currency = 'ARS'),
  constraint storefront_orders_notes_length_check check (
    char_length(coalesce(customer_notes, '')) <= 1000
    and char_length(coalesce(admin_notes, '')) <= 4000
  )
);

create table if not exists public.storefront_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.storefront_orders(id) on delete restrict,
  storefront_product_id uuid references public.storefront_products(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  sku_snapshot text not null,
  product_name_snapshot text not null,
  unit_price_snapshot numeric(14,2) not null,
  quantity integer not null,
  subtotal numeric(14,2) not null,
  product_image_snapshot text,
  created_at timestamptz not null default now(),
  constraint storefront_order_items_quantity_check check (quantity between 1 and 99),
  constraint storefront_order_items_price_check check (
    unit_price_snapshot >= 0 and subtotal = unit_price_snapshot * quantity
  )
);

create table if not exists public.storefront_order_status_history (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.storefront_orders(id) on delete restrict,
  previous_status text,
  new_status text not null,
  changed_by uuid references auth.users(id) on delete set null,
  customer_visible_note text,
  created_at timestamptz not null default now(),
  constraint storefront_order_history_previous_status_check check (previous_status is null or previous_status in (
    'pending_whatsapp', 'pending_confirmation', 'confirmed', 'awaiting_payment',
    'paid', 'preparing', 'shipped', 'ready_for_pickup', 'completed', 'cancelled'
  )),
  constraint storefront_order_history_new_status_check check (new_status in (
    'pending_whatsapp', 'pending_confirmation', 'confirmed', 'awaiting_payment',
    'paid', 'preparing', 'shipped', 'ready_for_pickup', 'completed', 'cancelled'
  )),
  constraint storefront_order_history_note_length_check check (char_length(coalesce(customer_visible_note, '')) <= 1000)
);

create index if not exists storefront_orders_user_created_idx
  on public.storefront_orders (user_id, created_at desc);
create index if not exists storefront_orders_status_created_idx
  on public.storefront_orders (status, created_at desc);
create index if not exists storefront_order_items_order_idx
  on public.storefront_order_items (order_id);
create index if not exists storefront_order_items_product_idx
  on public.storefront_order_items (storefront_product_id) where storefront_product_id is not null;
create index if not exists storefront_order_history_order_created_idx
  on public.storefront_order_status_history (order_id, created_at desc);

alter table public.storefront_orders enable row level security;
alter table public.storefront_order_items enable row level security;
alter table public.storefront_order_status_history enable row level security;

create policy storefront_orders_select_own_or_admin on public.storefront_orders
for select to authenticated
using ((select auth.uid()) = user_id or (select private.is_admin()));
create policy storefront_orders_admin_update on public.storefront_orders
for update to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy storefront_order_items_select_own_or_admin on public.storefront_order_items
for select to authenticated
using (
  exists (
    select 1 from public.storefront_orders as customer_order
    where customer_order.id = storefront_order_items.order_id
      and (customer_order.user_id = (select auth.uid()) or (select private.is_admin()))
  )
);

create policy storefront_order_history_select_own_or_admin on public.storefront_order_status_history
for select to authenticated
using (
  exists (
    select 1 from public.storefront_orders as customer_order
    where customer_order.id = storefront_order_status_history.order_id
      and (customer_order.user_id = (select auth.uid()) or (select private.is_admin()))
  )
);

revoke all on public.storefront_orders, public.storefront_order_items, public.storefront_order_status_history from public, anon;
grant select on public.storefront_orders, public.storefront_order_items, public.storefront_order_status_history to authenticated;
grant update on public.storefront_orders to authenticated;

-- ---------------------------------------------------------------------------
-- Persistent carts and future abandoned-cart recovery
-- ---------------------------------------------------------------------------

create table if not exists public.storefront_carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active',
  last_activity_at timestamptz not null default now(),
  abandoned_at timestamptz,
  recovery_email_sent_at timestamptz,
  converted_order_id uuid references public.storefront_orders(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint storefront_carts_status_check check (status in ('active', 'converted', 'abandoned'))
);

create table if not exists public.storefront_cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.storefront_carts(id) on delete cascade,
  storefront_product_id uuid not null references public.storefront_products(id) on delete cascade,
  quantity integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint storefront_cart_items_quantity_check check (quantity between 1 and 99),
  constraint storefront_cart_items_unique_product unique (cart_id, storefront_product_id)
);

create unique index if not exists storefront_carts_one_active_idx
  on public.storefront_carts (user_id) where status = 'active';
create index if not exists storefront_carts_activity_idx
  on public.storefront_carts (status, last_activity_at) where status = 'active';
create index if not exists storefront_cart_items_cart_idx
  on public.storefront_cart_items (cart_id);

alter table public.storefront_carts enable row level security;
alter table public.storefront_cart_items enable row level security;

create policy storefront_carts_own_or_admin_all on public.storefront_carts
for all to authenticated
using ((select auth.uid()) = user_id or (select private.is_admin()))
with check ((select auth.uid()) = user_id or (select private.is_admin()));

create policy storefront_cart_items_own_or_admin_all on public.storefront_cart_items
for all to authenticated
using (
  exists (
    select 1 from public.storefront_carts as customer_cart
    where customer_cart.id = cart_id
      and (customer_cart.user_id = (select auth.uid()) or (select private.is_admin()))
  )
)
with check (
  exists (
    select 1 from public.storefront_carts as customer_cart
    where customer_cart.id = cart_id
      and (customer_cart.user_id = (select auth.uid()) or (select private.is_admin()))
  )
);

revoke all on public.storefront_carts, public.storefront_cart_items from public, anon;
grant select, insert, update, delete on public.storefront_carts, public.storefront_cart_items to authenticated;

drop trigger if exists storefront_carts_set_updated_at on public.storefront_carts;
create trigger storefront_carts_set_updated_at
before update on public.storefront_carts
for each row execute function private.set_storefront_updated_at();
drop trigger if exists storefront_cart_items_set_updated_at on public.storefront_cart_items;
create trigger storefront_cart_items_set_updated_at
before update on public.storefront_cart_items
for each row execute function private.set_storefront_updated_at();

-- ---------------------------------------------------------------------------
-- Administrative audit log
-- ---------------------------------------------------------------------------

create table if not exists public.storefront_admin_logs (
  id bigint generated always as identity primary key,
  admin_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint storefront_admin_logs_action_length_check check (
    char_length(action) between 1 and 100
    and char_length(entity_type) between 1 and 80
    and char_length(coalesce(entity_id, '')) <= 160
  )
);

create index if not exists storefront_admin_logs_created_idx
  on public.storefront_admin_logs (created_at desc);
create index if not exists storefront_admin_logs_entity_idx
  on public.storefront_admin_logs (entity_type, entity_id, created_at desc);

alter table public.storefront_admin_logs enable row level security;
create policy storefront_admin_logs_admin_select on public.storefront_admin_logs
for select to authenticated using ((select private.is_admin()));
revoke all on public.storefront_admin_logs from public, anon;
grant select on public.storefront_admin_logs to authenticated;

alter table public.storefront_products
  add column if not exists archived_at timestamptz;

-- ---------------------------------------------------------------------------
-- Atomic order creation. Prices, publication and operational stock are read
-- again on the server. No stock is reserved or deducted at this stage.
-- ---------------------------------------------------------------------------

create or replace function private.create_storefront_order(
  p_items jsonb,
  p_delivery_method text,
  p_shipping_address_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_customer_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text;
  created_order_id uuid;
  generated_number text;
  calculated_subtotal numeric(14,2);
  address_snapshot jsonb;
  inserted_items jsonb;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = current_user_id and account_status = 'active'
  ) then
    raise exception 'account_not_active' using errcode = '42501';
  end if;

  select email into current_email
  from auth.users
  where id = current_user_id and email_confirmed_at is not null;
  if current_email is null then
    raise exception 'email_not_verified' using errcode = '42501';
  end if;

  if p_delivery_method not in ('shipping', 'pickup', 'coordinate') then
    raise exception 'invalid_delivery_method' using errcode = '22023';
  end if;
  if nullif(trim(coalesce(p_customer_name, '')), '') is null
    or nullif(trim(coalesce(p_customer_phone, '')), '') is null then
    raise exception 'customer_contact_required' using errcode = '22023';
  end if;
  if char_length(p_customer_name) > 160 or char_length(p_customer_phone) > 40
    or char_length(coalesce(p_customer_notes, '')) > 1000 then
    raise exception 'customer_data_too_long' using errcode = '22023';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1
    or jsonb_array_length(p_items) > 25 then
    raise exception 'invalid_cart' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_items) as requested(id uuid, quantity integer)
    where requested.id is null or requested.quantity not between 1 and 99
  ) or (
    select count(*) from jsonb_to_recordset(p_items) as requested(id uuid, quantity integer)
  ) <> (
    select count(distinct requested.id) from jsonb_to_recordset(p_items) as requested(id uuid, quantity integer)
  ) then
    raise exception 'invalid_cart_items' using errcode = '22023';
  end if;

  if p_delivery_method = 'shipping' then
    select jsonb_build_object(
      'label', address.label,
      'recipient_name', address.recipient_name,
      'phone', address.phone,
      'street', address.street,
      'street_number', address.street_number,
      'floor', address.floor,
      'apartment', address.apartment,
      'city', address.city,
      'province', address.province,
      'postal_code', address.postal_code,
      'additional_info', address.additional_info
    ) into address_snapshot
    from public.customer_addresses as address
    where address.id = p_shipping_address_id and address.user_id = current_user_id;
    if address_snapshot is null then
      raise exception 'shipping_address_required' using errcode = '22023';
    end if;
  end if;

  perform 1
  from public.products as source_product
  join public.storefront_products as storefront_product on storefront_product.product_id = source_product.id
  join jsonb_to_recordset(p_items) as requested(id uuid, quantity integer) on requested.id = storefront_product.id
  order by storefront_product.id
  for update of source_product;

  if (
    select count(*)
    from public.storefront_products as storefront_product
    join public.products as source_product on source_product.id = storefront_product.product_id
    join jsonb_to_recordset(p_items) as requested(id uuid, quantity integer) on requested.id = storefront_product.id
    where storefront_product.is_published
      and storefront_product.archived_at is null
      and storefront_product.public_price > 0
      and source_product.is_active
      and source_product.stock >= requested.quantity
  ) <> jsonb_array_length(p_items) then
    raise exception 'products_changed_or_unavailable' using errcode = 'P0001';
  end if;

  select sum(storefront_product.public_price * requested.quantity)::numeric(14,2)
  into calculated_subtotal
  from public.storefront_products as storefront_product
  join jsonb_to_recordset(p_items) as requested(id uuid, quantity integer) on requested.id = storefront_product.id;

  generated_number := 'CHT-' || lpad(nextval('private.storefront_order_number_seq')::text, 6, '0');

  insert into public.storefront_orders (
    order_number, user_id, status, delivery_method, shipping_address_id,
    shipping_address_snapshot, customer_name_snapshot, customer_email_snapshot,
    customer_phone_snapshot, subtotal, shipping_cost, total, customer_notes
  ) values (
    generated_number, current_user_id, 'pending_whatsapp', p_delivery_method,
    case when p_delivery_method = 'shipping' then p_shipping_address_id end,
    address_snapshot, trim(p_customer_name), current_email, trim(p_customer_phone),
    calculated_subtotal, 0, calculated_subtotal, nullif(trim(coalesce(p_customer_notes, '')), '')
  ) returning id into created_order_id;

  insert into public.storefront_order_items (
    order_id, storefront_product_id, product_id, sku_snapshot,
    product_name_snapshot, unit_price_snapshot, quantity, subtotal,
    product_image_snapshot
  )
  select
    created_order_id,
    storefront_product.id,
    storefront_product.product_id,
    storefront_product.sku,
    storefront_product.name,
    storefront_product.public_price,
    requested.quantity,
    storefront_product.public_price * requested.quantity,
    storefront_product.primary_image_url
  from public.storefront_products as storefront_product
  join jsonb_to_recordset(p_items) as requested(id uuid, quantity integer)
    on requested.id = storefront_product.id;

  insert into public.storefront_order_status_history (
    order_id, previous_status, new_status, changed_by, customer_visible_note
  ) values (
    created_order_id, null, 'pending_whatsapp', current_user_id, 'Pedido generado desde la tienda.'
  );

  update public.storefront_carts
  set status = 'converted', converted_order_id = created_order_id, updated_at = now()
  where user_id = current_user_id and status = 'active';

  select jsonb_agg(jsonb_build_object(
    'name', item.product_name_snapshot,
    'sku', item.sku_snapshot,
    'quantity', item.quantity,
    'unit_price', item.unit_price_snapshot,
    'subtotal', item.subtotal
  ) order by item.created_at, item.id)
  into inserted_items
  from public.storefront_order_items as item
  where item.order_id = created_order_id;

  return jsonb_build_object(
    'id', created_order_id,
    'order_number', generated_number,
    'subtotal', calculated_subtotal,
    'total', calculated_subtotal,
    'currency', 'ARS',
    'delivery_method', p_delivery_method,
    'items', coalesce(inserted_items, '[]'::jsonb)
  );
end;
$$;

create or replace function public.create_storefront_order(
  p_items jsonb,
  p_delivery_method text,
  p_shipping_address_id uuid default null,
  p_customer_name text default null,
  p_customer_phone text default null,
  p_customer_notes text default null
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.create_storefront_order(
    p_items, p_delivery_method, p_shipping_address_id,
    p_customer_name, p_customer_phone, p_customer_notes
  );
$$;

revoke all on function private.create_storefront_order(jsonb,text,uuid,text,text,text) from public, anon;
grant execute on function private.create_storefront_order(jsonb,text,uuid,text,text,text) to authenticated;
revoke all on function public.create_storefront_order(jsonb,text,uuid,text,text,text) from public, anon;
grant execute on function public.create_storefront_order(jsonb,text,uuid,text,text,text) to authenticated;

create or replace function private.admin_update_storefront_order(
  p_order_id uuid,
  p_status text,
  p_admin_notes text default null,
  p_customer_visible_note text default null
)
returns public.storefront_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin_id uuid := auth.uid();
  previous_order public.storefront_orders;
  updated_order public.storefront_orders;
begin
  if admin_id is null or not (select private.is_admin()) then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  if p_status not in (
    'pending_whatsapp', 'pending_confirmation', 'confirmed', 'awaiting_payment',
    'paid', 'preparing', 'shipped', 'ready_for_pickup', 'completed', 'cancelled'
  ) then
    raise exception 'invalid_order_status' using errcode = '22023';
  end if;
  if char_length(coalesce(p_admin_notes, '')) > 4000
    or char_length(coalesce(p_customer_visible_note, '')) > 1000 then
    raise exception 'note_too_long' using errcode = '22023';
  end if;

  select * into previous_order
  from public.storefront_orders
  where id = p_order_id
  for update;
  if previous_order.id is null then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;

  update public.storefront_orders
  set
    status = p_status,
    admin_notes = nullif(trim(coalesce(p_admin_notes, '')), ''),
    confirmed_at = case
      when p_status in ('confirmed', 'awaiting_payment', 'paid', 'preparing', 'shipped', 'ready_for_pickup', 'completed')
        then coalesce(confirmed_at, now()) else confirmed_at end,
    cancelled_at = case when p_status = 'cancelled' then coalesce(cancelled_at, now()) else null end,
    updated_at = now()
  where id = p_order_id
  returning * into updated_order;

  if previous_order.status is distinct from p_status then
    insert into public.storefront_order_status_history (
      order_id, previous_status, new_status, changed_by, customer_visible_note
    ) values (
      p_order_id, previous_order.status, p_status, admin_id,
      nullif(trim(coalesce(p_customer_visible_note, '')), '')
    );
  end if;

  insert into public.storefront_admin_logs (
    admin_user_id, action, entity_type, entity_id, metadata
  ) values (
    admin_id, 'order.status_updated', 'storefront_order', p_order_id::text,
    jsonb_build_object('from', previous_order.status, 'to', p_status)
  );

  return updated_order;
end;
$$;

create or replace function public.admin_update_storefront_order(
  p_order_id uuid,
  p_status text,
  p_admin_notes text default null,
  p_customer_visible_note text default null
)
returns public.storefront_orders
language sql
security invoker
set search_path = ''
as $$
  select private.admin_update_storefront_order(
    p_order_id, p_status, p_admin_notes, p_customer_visible_note
  );
$$;

revoke all on function private.admin_update_storefront_order(uuid,text,text,text) from public, anon;
grant execute on function private.admin_update_storefront_order(uuid,text,text,text) to authenticated;
revoke all on function public.admin_update_storefront_order(uuid,text,text,text) from public, anon;
grant execute on function public.admin_update_storefront_order(uuid,text,text,text) to authenticated;

-- Ensure customer profile reads remain possible without opening the internal
-- operational tables. Profile writes stay behind the narrow RPC above.
drop policy if exists profiles_select_own_or_admin on public.profiles;
create policy profiles_select_own_or_admin on public.profiles
for select to authenticated
using ((select auth.uid()) = id or (select private.is_admin()));

commit;

-- Reversal guidance (manual, after exporting any storefront data): remove the
-- new RPCs/policies/tables in dependency order, then remove only the added
-- profile columns. Do not revert the safe customer-default auth trigger.
