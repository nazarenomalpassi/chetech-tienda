-- Keep order history monotonic and make customer-visible notes reliable.

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
  previous_rank integer;
  next_rank integer;
  visible_note text := nullif(trim(coalesce(p_customer_visible_note, '')), '');
begin
  if admin_id is null or not (select private.is_admin()) then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  if p_status not in (
    'pending_whatsapp',
    'pending_confirmation',
    'confirmed',
    'awaiting_payment',
    'paid',
    'preparing',
    'shipped',
    'ready_for_pickup',
    'completed',
    'cancelled'
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

  previous_rank := case previous_order.status
    when 'pending_whatsapp' then 1
    when 'pending_confirmation' then 2
    when 'confirmed' then 3
    when 'awaiting_payment' then 4
    when 'paid' then 5
    when 'preparing' then 6
    when 'shipped' then 7
    when 'ready_for_pickup' then 7
    when 'completed' then 8
    when 'cancelled' then 9
  end;
  next_rank := case p_status
    when 'pending_whatsapp' then 1
    when 'pending_confirmation' then 2
    when 'confirmed' then 3
    when 'awaiting_payment' then 4
    when 'paid' then 5
    when 'preparing' then 6
    when 'shipped' then 7
    when 'ready_for_pickup' then 7
    when 'completed' then 8
    when 'cancelled' then 9
  end;

  if previous_order.status in ('completed', 'cancelled')
     and previous_order.status is distinct from p_status then
    raise exception 'terminal_order_cannot_be_reopened' using errcode = '22023';
  end if;
  if p_status <> 'cancelled' and next_rank < previous_rank then
    raise exception 'order_status_cannot_move_backwards' using errcode = '22023';
  end if;

  update public.storefront_orders
  set
    status = p_status,
    admin_notes = nullif(trim(coalesce(p_admin_notes, '')), ''),
    confirmed_at = case
      when p_status in (
        'confirmed',
        'awaiting_payment',
        'paid',
        'preparing',
        'shipped',
        'ready_for_pickup',
        'completed'
      ) then coalesce(confirmed_at, now())
      else confirmed_at
    end,
    cancelled_at = case
      when p_status = 'cancelled' then coalesce(cancelled_at, now())
      else cancelled_at
    end,
    updated_at = now()
  where id = p_order_id
  returning * into updated_order;

  if previous_order.status is distinct from p_status or visible_note is not null then
    insert into public.storefront_order_status_history (
      order_id,
      previous_status,
      new_status,
      changed_by,
      customer_visible_note
    ) values (
      p_order_id,
      previous_order.status,
      p_status,
      admin_id,
      visible_note
    );
  end if;

  insert into public.storefront_admin_logs (
    admin_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  ) values (
    admin_id,
    case
      when previous_order.status is distinct from p_status
        then 'order.status_updated'
      else 'order.note_added'
    end,
    'storefront_order',
    p_order_id::text,
    jsonb_build_object(
      'from', previous_order.status,
      'to', p_status,
      'customer_note_added', visible_note is not null
    )
  );

  return updated_order;
end;
$$;

revoke all on function private.admin_update_storefront_order(
  uuid, text, text, text
) from public, anon;
grant execute on function private.admin_update_storefront_order(
  uuid, text, text, text
) to authenticated;

-- Expand the product audit trail to cover every public presentation field.
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
    if old.brand is distinct from new.brand then changed := array_append(changed, 'brand'); end if;
    if old.model is distinct from new.model then changed := array_append(changed, 'model'); end if;
    if old.condition is distinct from new.condition then changed := array_append(changed, 'condition'); end if;
    if old.warranty is distinct from new.warranty then changed := array_append(changed, 'warranty'); end if;
    if old.public_price is distinct from new.public_price then changed := array_append(changed, 'public_price'); end if;
    if old.is_published is distinct from new.is_published then changed := array_append(changed, 'is_published'); end if;
    if old.archived_at is distinct from new.archived_at then changed := array_append(changed, 'archived_at'); end if;
    if old.is_featured is distinct from new.is_featured then changed := array_append(changed, 'is_featured'); end if;
    if old.is_offer is distinct from new.is_offer then changed := array_append(changed, 'is_offer'); end if;
    if old.is_new is distinct from new.is_new then changed := array_append(changed, 'is_new'); end if;
    if old.shipping_enabled is distinct from new.shipping_enabled then changed := array_append(changed, 'shipping_enabled'); end if;
    if old.pickup_enabled is distinct from new.pickup_enabled then changed := array_append(changed, 'pickup_enabled'); end if;
    if old.primary_image_url is distinct from new.primary_image_url then changed := array_append(changed, 'primary_image_url'); end if;
    if old.board_code is distinct from new.board_code then changed := array_append(changed, 'board_code'); end if;
    if old.part_number is distinct from new.part_number then changed := array_append(changed, 'part_number'); end if;
    if old.board_type is distinct from new.board_type then changed := array_append(changed, 'board_type'); end if;
    if old.compatible_models is distinct from new.compatible_models then changed := array_append(changed, 'compatible_models'); end if;
    if old.board_notes is distinct from new.board_notes then changed := array_append(changed, 'board_notes'); end if;
  end if;

  if coalesce(array_length(changed, 1), 0) > 0 then
    insert into public.storefront_admin_logs (
      admin_user_id,
      action,
      entity_type,
      entity_id,
      metadata
    ) values (
      actor,
      case
        when tg_op = 'INSERT' then 'product.created'
        when tg_op = 'DELETE' then 'product.deleted'
        else 'product.updated'
      end,
      'storefront_product',
      coalesce(new.id, old.id)::text,
      jsonb_build_object(
        'changed_fields', to_jsonb(changed),
        'sku', coalesce(new.sku, old.sku)
      )
    );
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

revoke all on function private.log_storefront_product_admin_change()
from public, anon, authenticated;
