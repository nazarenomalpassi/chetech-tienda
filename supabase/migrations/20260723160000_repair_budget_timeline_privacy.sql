-- Privacy hardening for customer-visible repair budget history.
--
-- A budget event must never remain customer-visible while the repair's budget
-- itself is hidden. The guards below enforce that invariant for old rows,
-- direct staff changes and every future insert/update path.

create or replace function private.guard_repair_budget_update_visibility()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  budget_is_visible boolean;
begin
  if new.event_type <> 'budget' then
    return new;
  end if;

  select repair_order.budget_visible_to_customer
  into budget_is_visible
  from public.repair_access_orders as repair_order
  where repair_order.id = new.repair_order_id;

  if not coalesce(budget_is_visible, false) then
    new.visible_to_customer := false;
  end if;

  return new;
end;
$function$;

revoke all on function private.guard_repair_budget_update_visibility()
  from public, anon, authenticated;

drop trigger if exists guard_repair_budget_update_visibility
  on public.repair_customer_updates;

create trigger guard_repair_budget_update_visibility
before insert or update of
  repair_order_id,
  event_type,
  visible_to_customer
on public.repair_customer_updates
for each row
execute function private.guard_repair_budget_update_visibility();

create or replace function private.hide_repair_budget_updates_when_hidden()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if old.budget_visible_to_customer
    and not new.budget_visible_to_customer then
    update public.repair_customer_updates
    set visible_to_customer = false
    where repair_order_id = new.id
      and event_type = 'budget'
      and visible_to_customer;
  end if;

  return new;
end;
$function$;

revoke all on function private.hide_repair_budget_updates_when_hidden()
  from public, anon, authenticated;

drop trigger if exists hide_repair_budget_updates_when_hidden
  on public.repair_access_orders;

create trigger hide_repair_budget_updates_when_hidden
after update of budget_visible_to_customer
on public.repair_access_orders
for each row
when (
  old.budget_visible_to_customer
  and not new.budget_visible_to_customer
)
execute function private.hide_repair_budget_updates_when_hidden();

-- Fail closed for any pre-existing timeline row created before these guards.
update public.repair_customer_updates as customer_update
set visible_to_customer = false
from public.repair_access_orders as repair_order
where repair_order.id = customer_update.repair_order_id
  and customer_update.event_type = 'budget'
  and customer_update.visible_to_customer
  and not repair_order.budget_visible_to_customer;

-- Read-side protection is the primary privacy boundary. Even if a stale or
-- legacy row were ever marked visible incorrectly, it cannot enter the DTO.
create or replace function private.get_my_customer_repair(
  p_public_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  current_user_id uuid := auth.uid();
  result_payload jsonb;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.profiles as profile
    where profile.id = current_user_id
      and profile.role = 'customer'
      and profile.account_status = 'active'
  ) then
    raise exception 'customer_account_required' using errcode = '42501';
  end if;

  select
    jsonb_strip_nulls(
      jsonb_build_object(
        'public_id', repair_order.customer_public_id,
        'repair_number', repair_order.repair_number,
        'device_type', device.device_type,
        'brand', device.brand,
        'model', device.model,
        'intake_date', repair_order.intake_date,
        'status', repair_order.status,
        'public_progress', repair_order.public_progress,
        'public_next_step', repair_order.public_next_step,
        'customer_action_required',
          repair_order.customer_action_required,
        'last_updated_at',
          coalesce(
            repair_order.last_customer_visible_update_at,
            repair_order.updated_at
          ),
        'updates', coalesce(
          (
            select jsonb_agg(
              jsonb_strip_nulls(
                jsonb_build_object(
                  'event_type', customer_update.event_type,
                  'status', customer_update.status,
                  'title', customer_update.title,
                  'message', customer_update.public_message,
                  'customer_action_required',
                    customer_update.customer_action_required,
                  'created_at', customer_update.created_at
                )
              )
              order by customer_update.created_at, customer_update.id
            )
            from public.repair_customer_updates as customer_update
            where customer_update.repair_order_id = repair_order.id
              and customer_update.visible_to_customer
              and (
                customer_update.event_type <> 'budget'
                or repair_order.budget_visible_to_customer
              )
          ),
          '[]'::jsonb
        )
      )
    )
    || case
      when repair_order.budget_visible_to_customer then
        jsonb_build_object(
          'budget',
          jsonb_strip_nulls(
            jsonb_build_object(
              'amount', repair_order.budget_amount,
              'budgeted_at', repair_order.budgeted_at,
              'status', case
                when repair_order.status in (
                  'presupuestado_aceptado',
                  'listo_para_retirar',
                  'retirado'
                )
                  then 'aceptado'
                when repair_order.status = 'presupuestado_rechazado'
                  then 'rechazado'
                when repair_order.budget_valid_until < current_date
                  then 'vencido'
                else 'pendiente'
              end,
              'description', repair_order.public_budget_description,
              'valid_until', repair_order.budget_valid_until
            )
          )
        )
      else '{}'::jsonb
    end
    || case
      when repair_order.warranty_active
        and repair_order.warranty_until is not null then
        jsonb_build_object(
          'warranty_until',
          repair_order.warranty_until
        )
      else '{}'::jsonb
    end
  into result_payload
  from public.repair_access_orders as repair_order
  join public.repair_access_devices as device
    on device.id = repair_order.device_id
  where repair_order.customer_public_id = p_public_id
    and repair_order.customer_user_id = current_user_id;

  return result_payload;
end;
$function$;

revoke all on function private.get_my_customer_repair(uuid)
  from public, anon;
grant execute on function private.get_my_customer_repair(uuid)
  to authenticated;

create or replace function private.get_my_customer_repairs_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  current_user_id uuid := auth.uid();
  total_count bigint;
  active_count bigint;
  recent_update_count bigint;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.profiles as profile
    where profile.id = current_user_id
      and profile.role = 'customer'
      and profile.account_status = 'active'
  ) then
    raise exception 'customer_account_required' using errcode = '42501';
  end if;

  select
    count(*),
    count(*) filter (
      where repair_order.status not in (
        'presupuestado_rechazado',
        'retirado',
        'sin_solucion'
      )
    )
  into total_count, active_count
  from public.repair_access_orders as repair_order
  where repair_order.customer_user_id = current_user_id;

  select count(*)
  into recent_update_count
  from public.repair_customer_updates as customer_update
  join public.repair_access_orders as repair_order
    on repair_order.id = customer_update.repair_order_id
  where repair_order.customer_user_id = current_user_id
    and customer_update.visible_to_customer
    and (
      customer_update.event_type <> 'budget'
      or repair_order.budget_visible_to_customer
    )
    and customer_update.created_at >= now() - interval '7 days';

  return jsonb_build_object(
    'total', total_count,
    'active', active_count,
    'recent_updates', recent_update_count
  );
end;
$function$;

revoke all on function private.get_my_customer_repairs_summary()
  from public, anon;
grant execute on function private.get_my_customer_repairs_summary()
  to authenticated;
