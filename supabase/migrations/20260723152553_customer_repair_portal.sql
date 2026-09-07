-- Customer repair portal.
--
-- The internal repair module remains the only source of truth. Customers never
-- receive direct access to repair_access_orders or repair_customer_updates:
-- public RPCs return explicit, customer-safe JSON projections instead.

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Repair ownership and customer-visible fields
-- ---------------------------------------------------------------------------

alter table public.repair_access_orders
  add column if not exists customer_user_id uuid,
  add column if not exists customer_public_id uuid default gen_random_uuid(),
  add column if not exists public_progress text,
  add column if not exists public_next_step text,
  add column if not exists budget_visible_to_customer boolean not null default false,
  add column if not exists public_budget_description text,
  add column if not exists budget_valid_until date,
  add column if not exists customer_action_required boolean not null default false,
  add column if not exists last_customer_visible_update_at timestamptz;

update public.repair_access_orders
set customer_public_id = gen_random_uuid()
where customer_public_id is null;

alter table public.repair_access_orders
  alter column customer_public_id set default gen_random_uuid(),
  alter column customer_public_id set not null,
  alter column status set default 'pendiente_revision';

do $ddl$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.repair_access_orders'::regclass
      and conname = 'repair_access_orders_customer_user_id_fkey'
  ) then
    alter table public.repair_access_orders
      add constraint repair_access_orders_customer_user_id_fkey
      foreign key (customer_user_id)
      references public.profiles(id)
      on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.repair_access_orders'::regclass
      and conname = 'repair_access_orders_public_content_length_check'
  ) then
    alter table public.repair_access_orders
      add constraint repair_access_orders_public_content_length_check
      check (
        char_length(coalesce(public_progress, '')) <= 2000
        and char_length(coalesce(public_next_step, '')) <= 1000
        and char_length(coalesce(public_budget_description, '')) <= 2000
      );
  end if;
end
$ddl$;

create unique index if not exists repair_access_orders_customer_public_id_key
  on public.repair_access_orders (customer_public_id);

create index if not exists repair_access_orders_customer_portal_idx
  on public.repair_access_orders (
    customer_user_id,
    intake_date desc,
    customer_public_id desc
  )
  where customer_user_id is not null;

-- ---------------------------------------------------------------------------
-- Deliberately public-safe history
-- ---------------------------------------------------------------------------

create table if not exists public.repair_customer_updates (
  id uuid primary key default gen_random_uuid(),
  repair_order_id uuid not null
    references public.repair_access_orders(id) on delete cascade,
  event_type text not null,
  status text,
  title text not null,
  public_message text,
  visible_to_customer boolean not null default true,
  customer_action_required boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint repair_customer_updates_event_type_check
    check (event_type in ('status', 'progress', 'budget', 'link')),
  constraint repair_customer_updates_status_check
    check (
      status is null or status in (
        'pendiente_revision',
        'en_revision',
        'presupuestado',
        'presupuestado_aceptado',
        'presupuestado_rechazado',
        'listo_para_retirar',
        'retirado',
        'sin_solucion'
      )
    ),
  constraint repair_customer_updates_content_check
    check (
      char_length(trim(title)) between 1 and 160
      and char_length(coalesce(public_message, '')) <= 2000
    )
);

create index if not exists repair_customer_updates_public_timeline_idx
  on public.repair_customer_updates (repair_order_id, created_at, id)
  where visible_to_customer;

create index if not exists repair_customer_updates_repair_order_id_idx
  on public.repair_customer_updates (repair_order_id);

create index if not exists repair_customer_updates_created_by_idx
  on public.repair_customer_updates (created_by)
  where created_by is not null;

alter table public.repair_customer_updates enable row level security;

drop policy if exists repair_customer_updates_operations_all
  on public.repair_customer_updates;
drop policy if exists repair_customer_updates_operations_select
  on public.repair_customer_updates;
create policy repair_customer_updates_operations_select
  on public.repair_customer_updates
  for select
  to authenticated
  using ((select private.can_access_operations()));

revoke all on public.repair_customer_updates from public, anon;
revoke all on public.repair_customer_updates from authenticated;
grant select on public.repair_customer_updates to authenticated;

-- Technicians still cannot select or mutate operational tables directly. This
-- trigger remains defense in depth for the narrowly-scoped technician RPCs.
-- Only the new customer-visible portal fields are added to the allow-list.
create or replace function private.enforce_technician_repair_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  allowed_columns text[] := array[
    'status',
    'technical_diagnosis',
    'repair_progress',
    'internal_observations',
    'used_parts',
    'work_performed',
    'budget_amount',
    'budget_detail',
    'final_amount',
    'budgeted_at',
    'budget_response_at',
    'finished_at',
    'technician_name',
    'technician_id',
    'public_progress',
    'public_next_step',
    'budget_visible_to_customer',
    'public_budget_description',
    'budget_valid_until',
    'customer_action_required',
    'last_customer_visible_update_at',
    'updated_by',
    'updated_at'
  ];
begin
  if (select private.is_technician()) then
    if (to_jsonb(new) - allowed_columns)
      is distinct from
      (to_jsonb(old) - allowed_columns) then
      raise exception
        'El rol tecnico no puede modificar datos administrativos de la orden.'
        using errcode = '42501';
    end if;

    if old.is_paid and (
      new.budget_amount is distinct from old.budget_amount
      or new.final_amount is distinct from old.final_amount
    ) then
      raise exception
        'El monto queda protegido porque la orden ya fue cobrada.'
        using errcode = '42501';
    end if;

    if new.updated_by is distinct from (select auth.uid()) then
      raise exception
        'La actualizacion tecnica debe identificar al usuario actual.'
        using errcode = '42501';
    end if;

    if new.technician_id is distinct from old.technician_id
      and new.technician_id is distinct from (select auth.uid()) then
      raise exception
        'Un tecnico solo puede asignarse una orden a si mismo.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function private.enforce_technician_repair_update()
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Customer-safe read API
-- ---------------------------------------------------------------------------

create or replace function private.get_my_customer_repairs(
  p_cursor_intake_date date default null,
  p_cursor_public_id uuid default null,
  p_limit integer default 12
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  current_user_id uuid := auth.uid();
  page_limit integer := least(greatest(coalesce(p_limit, 12), 1), 50);
  items jsonb := '[]'::jsonb;
  has_more boolean := false;
  last_intake_date date;
  last_public_id uuid;
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

  if (p_cursor_intake_date is null) <> (p_cursor_public_id is null) then
    raise exception 'invalid_repair_cursor' using errcode = '22023';
  end if;

  with candidates as materialized (
    select
      repair_order.intake_date,
      repair_order.customer_public_id,
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
      end as item
    from public.repair_access_orders as repair_order
    join public.repair_access_devices as device
      on device.id = repair_order.device_id
    where repair_order.customer_user_id = current_user_id
      and (
        p_cursor_intake_date is null
        or (
          repair_order.intake_date,
          repair_order.customer_public_id
        ) < (
          p_cursor_intake_date,
          p_cursor_public_id
        )
      )
    order by
      repair_order.intake_date desc,
      repair_order.customer_public_id desc
    limit page_limit + 1
  ),
  page as (
    select *
    from candidates
    order by intake_date desc, customer_public_id desc
    limit page_limit
  )
  select
    coalesce(
      jsonb_agg(
        page.item
        order by page.intake_date desc, page.customer_public_id desc
      ),
      '[]'::jsonb
    ),
    (select count(*) > page_limit from candidates),
    (
      select cursor_row.intake_date
      from page as cursor_row
      order by cursor_row.intake_date desc, cursor_row.customer_public_id desc
      offset greatest(page_limit - 1, 0)
      limit 1
    ),
    (
      select cursor_row.customer_public_id
      from page as cursor_row
      order by cursor_row.intake_date desc, cursor_row.customer_public_id desc
      offset greatest(page_limit - 1, 0)
      limit 1
    )
  into items, has_more, last_intake_date, last_public_id
  from page;

  return jsonb_build_object(
    'items', items,
    'next_cursor', case
      when has_more then jsonb_build_object(
        'intake_date', last_intake_date,
        'public_id', last_public_id
      )
      else null
    end
  );
end;
$function$;

create or replace function public.get_my_customer_repairs(
  p_cursor_intake_date date default null,
  p_cursor_public_id uuid default null,
  p_limit integer default 12
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select private.get_my_customer_repairs(
    p_cursor_intake_date,
    p_cursor_public_id,
    p_limit
  );
$function$;

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

create or replace function public.get_my_customer_repair(
  p_public_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select private.get_my_customer_repair(p_public_id);
$function$;

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

create or replace function public.get_my_customer_repairs_summary()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select private.get_my_customer_repairs_summary();
$function$;

-- ---------------------------------------------------------------------------
-- Internal administration API
-- ---------------------------------------------------------------------------

create or replace function private.search_storefront_customers_for_repair(
  p_query text,
  p_limit integer default 20
)
returns table (
  id uuid,
  full_name text,
  email text,
  phone text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  search_term text := nullif(trim(coalesce(p_query, '')), '');
  search_digits text := nullif(
    regexp_replace(coalesce(search_term, ''), '[^0-9]', '', 'g'),
    ''
  );
  result_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
begin
  if auth.uid() is null or not (select private.is_admin()) then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  return query
  select
    profile.id,
    coalesce(
      nullif(trim(profile.full_name), ''),
      nullif(trim(concat_ws(' ', profile.first_name, profile.last_name)), '')
    ) as full_name,
    profile.email,
    profile.phone
  from public.profiles as profile
  where profile.role = 'customer'
    and profile.account_status = 'active'
    and (
      search_term is null
      or profile.full_name ilike '%' || search_term || '%'
      or profile.first_name ilike '%' || search_term || '%'
      or profile.last_name ilike '%' || search_term || '%'
      or concat_ws(' ', profile.first_name, profile.last_name)
        ilike '%' || search_term || '%'
      or profile.email ilike '%' || search_term || '%'
      or profile.phone ilike '%' || search_term || '%'
      or (
        search_digits is not null
        and regexp_replace(
          coalesce(profile.phone, ''),
          '[^0-9]',
          '',
          'g'
        ) like '%' || search_digits || '%'
      )
    )
  order by
    case
      when search_term is not null
        and lower(coalesce(
          nullif(trim(profile.full_name), ''),
          nullif(trim(concat_ws(
            ' ',
            profile.first_name,
            profile.last_name
          )), '')
        )) = lower(search_term) then 0
      when search_term is not null
        and lower(profile.email) = lower(search_term) then 1
      when search_digits is not null
        and regexp_replace(
          coalesce(profile.phone, ''),
          '[^0-9]',
          '',
          'g'
        ) = search_digits then 2
      else 3
    end,
    lower(coalesce(
      nullif(trim(profile.full_name), ''),
      nullif(trim(concat_ws(' ', profile.first_name, profile.last_name)), ''),
      profile.email,
      ''
    )),
    profile.id
  limit result_limit;
end;
$function$;

create or replace function public.search_storefront_customers_for_repair(
  p_query text,
  p_limit integer default 20
)
returns table (
  id uuid,
  full_name text,
  email text,
  phone text
)
language sql
stable
security invoker
set search_path = ''
as $function$
  select *
  from private.search_storefront_customers_for_repair(p_query, p_limit);
$function$;

create or replace function private.link_repair_to_storefront_customer(
  p_order_id uuid,
  p_customer_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := auth.uid();
  previous_order public.repair_access_orders%rowtype;
  selected_customer public.profiles%rowtype;
  changed_at timestamptz := now();
begin
  if actor_id is null or not (select private.is_admin()) then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  select *
  into previous_order
  from public.repair_access_orders
  where id = p_order_id
  for update;

  if previous_order.id is null then
    raise exception 'repair_not_found' using errcode = 'P0002';
  end if;

  if p_customer_user_id is not null then
    select *
    into selected_customer
    from public.profiles as profile
    where profile.id = p_customer_user_id
      and profile.role = 'customer'
      and profile.account_status = 'active';

    if selected_customer.id is null then
      raise exception 'active_storefront_customer_required'
        using errcode = '22023';
    end if;
  end if;

  if previous_order.customer_user_id is distinct from p_customer_user_id then
    update public.repair_access_orders
    set
      customer_user_id = p_customer_user_id,
      last_customer_visible_update_at = case
        when p_customer_user_id is null then null
        else changed_at
      end,
      updated_by = actor_id,
      updated_at = changed_at
    where id = p_order_id;

    insert into public.audit_logs (
      entity_type,
      entity_id,
      action,
      changes,
      user_id
    ) values (
      'repair_access_orders',
      p_order_id::text,
      'update',
      jsonb_build_object(
        'field', 'customer_user_id',
        'previous', previous_order.customer_user_id,
        'next', p_customer_user_id,
        'customer_visible', p_customer_user_id is not null
      ),
      actor_id
    );

    insert into public.storefront_admin_logs (
      admin_user_id,
      action,
      entity_type,
      entity_id,
      metadata
    ) values (
      actor_id,
      case
        when p_customer_user_id is null then 'repair.customer_unlinked'
        else 'repair.customer_linked'
      end,
      'repair_access_order',
      p_order_id::text,
      jsonb_build_object(
        'previous_customer_user_id', previous_order.customer_user_id,
        'customer_user_id', p_customer_user_id
      )
    );

    if p_customer_user_id is not null then
      insert into public.repair_customer_updates (
        repair_order_id,
        event_type,
        status,
        title,
        public_message,
        visible_to_customer,
        customer_action_required,
        created_by,
        created_at
      ) values (
        p_order_id,
        'link',
        previous_order.status,
        'Reparación vinculada a tu cuenta',
        'Ya podés consultar el seguimiento de esta reparación desde tu cuenta.',
        true,
        previous_order.customer_action_required,
        actor_id,
        changed_at
      );
    end if;
  end if;

  return jsonb_build_object(
    'repair_order_id', p_order_id,
    'customer_user_id', p_customer_user_id,
    'linked', p_customer_user_id is not null,
    'customer', case
      when p_customer_user_id is null then null
      else jsonb_strip_nulls(
        jsonb_build_object(
          'id', selected_customer.id,
          'full_name', selected_customer.full_name,
          'email', selected_customer.email,
          'phone', selected_customer.phone
        )
      )
    end
  );
end;
$function$;

create or replace function public.link_repair_to_storefront_customer(
  p_order_id uuid,
  p_customer_user_id uuid
)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
  select private.link_repair_to_storefront_customer(
    p_order_id,
    p_customer_user_id
  );
$function$;

create or replace function private.update_repair_customer_portal(
  p_order_id uuid,
  p_public_progress text,
  p_public_next_step text,
  p_customer_action_required boolean,
  p_budget_visible_to_customer boolean,
  p_public_budget_description text,
  p_budget_valid_until date,
  p_publish_update boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := auth.uid();
  previous_order public.repair_access_orders%rowtype;
  updated_order public.repair_access_orders%rowtype;
  clean_progress text :=
    nullif(trim(coalesce(p_public_progress, '')), '');
  clean_next_step text :=
    nullif(trim(coalesce(p_public_next_step, '')), '');
  clean_budget_description text :=
    nullif(trim(coalesce(p_public_budget_description, '')), '');
  visible_budget boolean := coalesce(p_budget_visible_to_customer, false);
  requires_action boolean := coalesce(p_customer_action_required, false);
  changed_fields text[] := array[]::text[];
  changed_at timestamptz := now();
  did_publish boolean := false;
begin
  if actor_id is null
    or not (select private.can_access_operations()) then
    raise exception 'operations_role_required' using errcode = '42501';
  end if;

  if char_length(coalesce(clean_progress, '')) > 2000
    or char_length(coalesce(clean_next_step, '')) > 1000
    or char_length(coalesce(clean_budget_description, '')) > 2000 then
    raise exception 'public_repair_content_too_long' using errcode = '22023';
  end if;

  select *
  into previous_order
  from public.repair_access_orders
  where id = p_order_id
  for update;

  if previous_order.id is null then
    raise exception 'repair_not_found' using errcode = 'P0002';
  end if;

  if visible_budget and (
    coalesce(previous_order.budget_amount, 0) <= 0
    or previous_order.budgeted_at is null
  ) then
    raise exception 'positive_budget_required_before_publication'
      using errcode = '22023';
  end if;

  if previous_order.public_progress is distinct from clean_progress then
    changed_fields := array_append(changed_fields, 'public_progress');
  end if;
  if previous_order.public_next_step is distinct from clean_next_step then
    changed_fields := array_append(changed_fields, 'public_next_step');
  end if;
  if previous_order.customer_action_required is distinct from requires_action then
    changed_fields := array_append(changed_fields, 'customer_action_required');
  end if;
  if previous_order.budget_visible_to_customer is distinct from visible_budget then
    changed_fields := array_append(
      changed_fields,
      'budget_visible_to_customer'
    );
  end if;
  if previous_order.public_budget_description
    is distinct from clean_budget_description then
    changed_fields := array_append(
      changed_fields,
      'public_budget_description'
    );
  end if;
  if previous_order.budget_valid_until is distinct from p_budget_valid_until then
    changed_fields := array_append(changed_fields, 'budget_valid_until');
  end if;

  if coalesce(array_length(changed_fields, 1), 0) > 0 then
    update public.repair_access_orders
    set
      public_progress = clean_progress,
      public_next_step = clean_next_step,
      customer_action_required = requires_action,
      budget_visible_to_customer = visible_budget,
      public_budget_description = clean_budget_description,
      budget_valid_until = p_budget_valid_until,
      last_customer_visible_update_at = changed_at,
      updated_by = actor_id,
      updated_at = changed_at
    where id = p_order_id
    returning * into updated_order;

    if coalesce(p_publish_update, true) then
      if visible_budget and changed_fields && array[
        'budget_visible_to_customer',
        'public_budget_description',
        'budget_valid_until'
      ]::text[] then
        insert into public.repair_customer_updates (
          repair_order_id,
          event_type,
          status,
          title,
          public_message,
          visible_to_customer,
          customer_action_required,
          created_by,
          created_at
        ) values (
          p_order_id,
          'budget',
          updated_order.status,
          'Presupuesto actualizado',
          coalesce(
            clean_budget_description,
            'El presupuesto de la reparación ya está disponible.'
          ),
          true,
          requires_action,
          actor_id,
          changed_at
        );

        did_publish := true;
      end if;

      if changed_fields && array[
        'public_progress',
        'public_next_step',
        'customer_action_required'
      ]::text[] then
        insert into public.repair_customer_updates (
          repair_order_id,
          event_type,
          status,
          title,
          public_message,
          visible_to_customer,
          customer_action_required,
          created_by,
          created_at
        ) values (
          p_order_id,
          'progress',
          updated_order.status,
          'Avance de la reparación',
          coalesce(
          clean_progress,
          clean_next_step,
          'Hay una nueva actualización disponible.'
          ),
          true,
          requires_action,
          actor_id,
          changed_at
        );

        did_publish := true;
      end if;
    end if;

    insert into public.audit_logs (
      entity_type,
      entity_id,
      action,
      changes,
      user_id
    ) values (
      'repair_access_orders',
      p_order_id::text,
      'update',
      jsonb_build_object(
        'changed_fields', to_jsonb(changed_fields),
        'previous', jsonb_build_object(
          'public_progress', previous_order.public_progress,
          'public_next_step', previous_order.public_next_step,
          'customer_action_required',
            previous_order.customer_action_required,
          'budget_visible_to_customer',
            previous_order.budget_visible_to_customer,
          'public_budget_description',
            previous_order.public_budget_description,
          'budget_valid_until', previous_order.budget_valid_until
        ),
        'next', jsonb_build_object(
          'public_progress', clean_progress,
          'public_next_step', clean_next_step,
          'customer_action_required', requires_action,
          'budget_visible_to_customer', visible_budget,
          'public_budget_description', clean_budget_description,
          'budget_valid_until', p_budget_valid_until
        ),
        'customer_visible_update_published', did_publish
      ),
      actor_id
    );

    insert into public.storefront_admin_logs (
      admin_user_id,
      action,
      entity_type,
      entity_id,
      metadata
    ) values (
      actor_id,
      'repair.customer_portal_updated',
      'repair_access_order',
      p_order_id::text,
      jsonb_build_object(
        'changed_fields', to_jsonb(changed_fields),
        'customer_visible_update_published', did_publish
      )
    );
  else
    updated_order := previous_order;
  end if;

  return jsonb_build_object(
    'repair_order_id', updated_order.id,
    'public_progress', updated_order.public_progress,
    'public_next_step', updated_order.public_next_step,
    'customer_action_required',
      updated_order.customer_action_required,
    'budget_visible_to_customer',
      updated_order.budget_visible_to_customer,
    'public_budget_description',
      updated_order.public_budget_description,
    'budget_valid_until', updated_order.budget_valid_until,
    'last_customer_visible_update_at',
      updated_order.last_customer_visible_update_at,
    'update_published', did_publish
  );
end;
$function$;

create or replace function public.update_repair_customer_portal(
  p_order_id uuid,
  p_public_progress text,
  p_public_next_step text,
  p_customer_action_required boolean,
  p_budget_visible_to_customer boolean,
  p_public_budget_description text,
  p_budget_valid_until date,
  p_publish_update boolean
)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
  select private.update_repair_customer_portal(
    p_order_id,
    p_public_progress,
    p_public_next_step,
    p_customer_action_required,
    p_budget_visible_to_customer,
    p_public_budget_description,
    p_budget_valid_until,
    p_publish_update
  );
$function$;

-- ---------------------------------------------------------------------------
-- Safe, generic status publication
-- ---------------------------------------------------------------------------

create or replace function private.publish_repair_customer_status_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  linked_order public.repair_access_orders%rowtype;
  public_title text;
  public_message text;
begin
  select *
  into linked_order
  from public.repair_access_orders
  where id = new.repair_order_id
    and customer_user_id is not null;

  if linked_order.id is null then
    return new;
  end if;

  public_title := case new.next_status
    when 'pendiente_revision' then 'Equipo recibido'
    when 'en_revision' then 'Equipo en revisión'
    when 'presupuestado' then 'Presupuesto preparado'
    when 'presupuestado_aceptado' then 'Presupuesto aceptado'
    when 'presupuestado_rechazado' then 'Presupuesto rechazado'
    when 'listo_para_retirar' then 'Equipo listo para retirar'
    when 'retirado' then 'Equipo retirado'
    when 'sin_solucion' then 'Revisión finalizada'
  end;

  public_message := case new.next_status
    when 'pendiente_revision'
      then 'Recibimos el equipo y está pendiente de revisión.'
    when 'en_revision'
      then 'El equipo se encuentra en revisión.'
    when 'presupuestado' then case
      when linked_order.budget_visible_to_customer
        then 'El presupuesto fue preparado y está disponible en el detalle.'
      else 'La revisión avanzó a la etapa de presupuesto.'
    end
    when 'presupuestado_aceptado'
      then 'El presupuesto fue registrado como aceptado.'
    when 'presupuestado_rechazado'
      then 'El presupuesto fue registrado como rechazado.'
    when 'listo_para_retirar'
      then 'El equipo está listo para retirar.'
    when 'retirado'
      then 'La reparación fue registrada como retirada.'
    when 'sin_solucion'
      then 'La revisión del equipo fue finalizada.'
  end;

  insert into public.repair_customer_updates (
    repair_order_id,
    event_type,
    status,
    title,
    public_message,
    visible_to_customer,
    customer_action_required,
    created_by,
    created_at
  ) values (
    new.repair_order_id,
    'status',
    new.next_status,
    public_title,
    public_message,
    true,
    linked_order.customer_action_required,
    new.changed_by,
    new.changed_at
  );

  update public.repair_access_orders
  set last_customer_visible_update_at = greatest(
    coalesce(
      last_customer_visible_update_at,
      '-infinity'::timestamptz
    ),
    new.changed_at
  )
  where id = new.repair_order_id;

  -- new.notes is intentionally never read or copied.
  return new;
end;
$function$;

revoke all on function private.publish_repair_customer_status_update()
  from public, anon, authenticated;

drop trigger if exists publish_repair_customer_status_update
  on public.repair_access_status_history;
create trigger publish_repair_customer_status_update
after insert on public.repair_access_status_history
for each row
execute function private.publish_repair_customer_status_update();

-- ---------------------------------------------------------------------------
-- Existing technician detail RPC, extended with portal controls
-- ---------------------------------------------------------------------------

create or replace function public.get_technician_repair_orders(
  p_order_id uuid default null
)
returns table(payload jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not (select private.can_access_operations()) then
    raise exception 'No tenes permiso para consultar las ordenes.'
      using errcode = '42501';
  end if;

  return query
  select jsonb_build_object(
    'id', repair_order.id,
    'repair_number', repair_order.repair_number,
    'intake_date', repair_order.intake_date,
    'issue_reported', repair_order.issue_reported,
    'technical_diagnosis', repair_order.technical_diagnosis,
    'repair_progress', repair_order.repair_progress,
    'budget_amount', repair_order.budget_amount,
    'budget_detail', repair_order.budget_detail,
    'budget_response_notes', null,
    'budget_response_at', null,
    'approved_amount', null,
    'final_amount', repair_order.final_amount,
    'payment_method', null,
    'payment_notes', null,
    'is_paid', repair_order.is_paid,
    'paid_at', null,
    'delivered_at', repair_order.delivered_at,
    'warranty_start', null,
    'warranty_until', null,
    'warranty_days', 0,
    'warranty_conditions', null,
    'warranty_active', false,
    'work_performed', repair_order.work_performed,
    'used_parts', repair_order.used_parts,
    'internal_observations', repair_order.internal_observations,
    'technician_name', repair_order.technician_name,
    'technician_id', repair_order.technician_id,
    'notes', null,
    'priority', repair_order.priority,
    'status', repair_order.status,
    'created_at', repair_order.created_at,
    'customer_user_id', repair_order.customer_user_id,
    'customer_public_id', repair_order.customer_public_id,
    'public_progress', repair_order.public_progress,
    'public_next_step', repair_order.public_next_step,
    'budget_visible_to_customer',
      repair_order.budget_visible_to_customer,
    'public_budget_description',
      repair_order.public_budget_description,
    'budget_valid_until', repair_order.budget_valid_until,
    'customer_action_required',
      repair_order.customer_action_required,
    'last_customer_visible_update_at',
      repair_order.last_customer_visible_update_at,
    'customer_portal_linked',
      repair_order.customer_user_id is not null,
    'storefront_customer', case
      when storefront_customer.id is null then null
      else jsonb_strip_nulls(
        jsonb_build_object(
          'id', storefront_customer.id,
          'full_name', storefront_customer.full_name,
          'email', storefront_customer.email,
          'phone', storefront_customer.phone
        )
      )
    end,
    'repair_access_customers', case
      when repair_customer.id is null then null
      else jsonb_build_object(
        'id', repair_customer.id,
        'full_name', repair_customer.full_name,
        'phone', repair_customer.phone,
        'alternate_phone', repair_customer.alternate_phone,
        'phone_normalized', repair_customer.phone_normalized,
        'dni', null,
        'email', null,
        'address', repair_customer.address,
        'notes', null
      )
    end,
    'repair_access_devices', case
      when repair_device.id is null then null
      else jsonb_build_object(
        'id', repair_device.id,
        'device_type', repair_device.device_type,
        'brand', repair_device.brand,
        'model', repair_device.model,
        'serial_number', repair_device.serial_number,
        'accessory_details', repair_device.accessory_details,
        'visual_condition', repair_device.visual_condition,
        'notes', repair_device.notes
      )
    end
  )
  from public.repair_access_orders as repair_order
  left join public.repair_access_customers as repair_customer
    on repair_customer.id = repair_order.customer_id
  left join public.repair_access_devices as repair_device
    on repair_device.id = repair_order.device_id
  left join public.profiles as storefront_customer
    on storefront_customer.id = repair_order.customer_user_id
  where p_order_id is null or repair_order.id = p_order_id
  order by repair_order.created_at desc
  limit case when p_order_id is null then 250 else 1 end;
end;
$function$;

revoke all on function private.get_my_customer_repairs(
  date, uuid, integer
) from public, anon;
grant execute on function private.get_my_customer_repairs(
  date, uuid, integer
) to authenticated;
revoke all on function public.get_my_customer_repairs(
  date, uuid, integer
) from public, anon;
grant execute on function public.get_my_customer_repairs(
  date, uuid, integer
) to authenticated;

revoke all on function private.get_my_customer_repair(uuid)
  from public, anon;
grant execute on function private.get_my_customer_repair(uuid)
  to authenticated;
revoke all on function public.get_my_customer_repair(uuid)
  from public, anon;
grant execute on function public.get_my_customer_repair(uuid)
  to authenticated;

revoke all on function private.get_my_customer_repairs_summary()
  from public, anon;
grant execute on function private.get_my_customer_repairs_summary()
  to authenticated;
revoke all on function public.get_my_customer_repairs_summary()
  from public, anon;
grant execute on function public.get_my_customer_repairs_summary()
  to authenticated;

revoke all on function private.search_storefront_customers_for_repair(text, integer)
  from public, anon;
grant execute on function private.search_storefront_customers_for_repair(text, integer)
  to authenticated;
revoke all on function public.search_storefront_customers_for_repair(text, integer)
  from public, anon;
grant execute on function public.search_storefront_customers_for_repair(text, integer)
  to authenticated;

revoke all on function private.link_repair_to_storefront_customer(uuid, uuid)
  from public, anon;
grant execute on function private.link_repair_to_storefront_customer(uuid, uuid)
  to authenticated;
revoke all on function public.link_repair_to_storefront_customer(uuid, uuid)
  from public, anon;
grant execute on function public.link_repair_to_storefront_customer(uuid, uuid)
  to authenticated;

revoke all on function private.update_repair_customer_portal(
  uuid, text, text, boolean, boolean, text, date, boolean
) from public, anon;
grant execute on function private.update_repair_customer_portal(
  uuid, text, text, boolean, boolean, text, date, boolean
) to authenticated;
revoke all on function public.update_repair_customer_portal(
  uuid, text, text, boolean, boolean, text, date, boolean
) from public, anon;
grant execute on function public.update_repair_customer_portal(
  uuid, text, text, boolean, boolean, text, date, boolean
) to authenticated;

revoke all on function public.get_technician_repair_orders(uuid)
  from public, anon;
grant execute on function public.get_technician_repair_orders(uuid)
  to authenticated, service_role;
