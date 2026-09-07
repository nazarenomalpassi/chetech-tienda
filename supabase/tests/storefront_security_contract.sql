-- Read-only regression checks for the customer, order and admin security model.
-- Run against a linked development or staging project after applying migrations.

do $$
declare
  relation_name text;
begin
  foreach relation_name in array array[
    'customer_addresses',
    'storefront_orders',
    'storefront_order_items',
    'storefront_order_status_history',
    'storefront_carts',
    'storefront_cart_items',
    'storefront_admin_logs'
  ] loop
    if not exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = relation_name
        and c.relrowsecurity
    ) then
      raise exception 'RLS must remain enabled on public.%', relation_name;
    end if;
  end loop;
end
$$;

do $$
begin
  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and cmd = 'INSERT'
  ) then
    raise exception 'Client-side profile insertion must remain disabled';
  end if;

  if exists (
    select 1
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in (
        'profiles',
        'customer_addresses',
        'storefront_orders',
        'storefront_order_items',
        'storefront_order_status_history',
        'storefront_carts',
        'storefront_cart_items',
        'storefront_admin_logs'
      )
      and grantee in ('anon', 'PUBLIC')
      and privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
  ) then
    raise exception 'Anonymous users must not have direct access to private customer data';
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'update_my_storefront_profile',
        'set_my_default_address',
        'create_storefront_order',
        'admin_update_storefront_order'
      )
      and p.prosecdef
  ) then
    raise exception 'Public RPC wrappers must remain security invoker';
  end if;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname in (
        'update_my_storefront_profile',
        'set_my_default_address',
        'create_storefront_order',
        'admin_update_storefront_order'
      )
      and not p.prosecdef
  ) then
    raise exception 'Private privileged functions must remain security definer';
  end if;
end
$$;

select 'storefront security contract: ok' as result;
