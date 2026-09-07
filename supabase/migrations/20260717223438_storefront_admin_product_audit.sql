begin;

create or replace function private.log_storefront_product_admin_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  changed text[] := array[]::text[];
begin
  if actor is null or not (select private.is_admin()) then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  if tg_op = 'INSERT' then
    changed := array['created'];
  elsif tg_op = 'DELETE' then
    changed := array['deleted'];
  else
    if old.name is distinct from new.name then changed := array_append(changed, 'name'); end if;
    if old.short_description is distinct from new.short_description then changed := array_append(changed, 'short_description'); end if;
    if old.description is distinct from new.description then changed := array_append(changed, 'description'); end if;
    if old.public_price is distinct from new.public_price then changed := array_append(changed, 'public_price'); end if;
    if old.is_published is distinct from new.is_published then changed := array_append(changed, 'is_published'); end if;
    if old.archived_at is distinct from new.archived_at then changed := array_append(changed, 'archived_at'); end if;
    if old.is_featured is distinct from new.is_featured then changed := array_append(changed, 'is_featured'); end if;
    if old.is_offer is distinct from new.is_offer then changed := array_append(changed, 'is_offer'); end if;
    if old.is_new is distinct from new.is_new then changed := array_append(changed, 'is_new'); end if;
    if old.primary_image_url is distinct from new.primary_image_url then changed := array_append(changed, 'primary_image_url'); end if;
    if old.condition is distinct from new.condition then changed := array_append(changed, 'condition'); end if;
    if old.board_code is distinct from new.board_code then changed := array_append(changed, 'board_code'); end if;
  end if;

  if coalesce(array_length(changed, 1), 0) > 0 then
    insert into public.storefront_admin_logs (admin_user_id, action, entity_type, entity_id, metadata)
    values (
      actor,
      case when tg_op = 'INSERT' then 'product.created' when tg_op = 'DELETE' then 'product.deleted' else 'product.updated' end,
      'storefront_product',
      coalesce(new.id, old.id)::text,
      jsonb_build_object('changed_fields', to_jsonb(changed), 'sku', coalesce(new.sku, old.sku))
    );
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

revoke all on function private.log_storefront_product_admin_change() from public, anon, authenticated;

drop trigger if exists storefront_products_admin_audit on public.storefront_products;
create trigger storefront_products_admin_audit
after insert or update or delete on public.storefront_products
for each row execute function private.log_storefront_product_admin_change();

commit;
