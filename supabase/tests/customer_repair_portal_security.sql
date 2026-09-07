-- Transactional security and behavior contract for the customer repair portal.
--
-- Run only against a local, development or disposable branch after applying,
-- in order, 20260723152553_customer_repair_portal.sql,
-- 20260723160000_repair_budget_timeline_privacy.sql and
-- 20260723160100_repair_budget_timeline_acl.sql, followed by
-- 20260723160200_repair_portal_event_grouping.sql. All fixtures use synthetic
-- values and the final ROLLBACK guarantees that no test data persists.

begin;

create temporary table customer_repair_portal_test_context (
  admin_id uuid not null,
  technician_id uuid not null,
  customer_a_id uuid not null,
  customer_b_id uuid not null,
  order_a_hidden_id uuid not null,
  order_a_visible_id uuid not null,
  order_b_id uuid not null,
  order_unlinked_id uuid not null,
  public_a_hidden_id uuid not null,
  public_a_visible_id uuid not null,
  public_b_id uuid not null,
  public_unlinked_id uuid not null
) on commit drop;

grant select on customer_repair_portal_test_context to authenticated;

do $setup$
declare
  v_admin uuid := gen_random_uuid();
  v_technician uuid := gen_random_uuid();
  v_customer_a uuid := gen_random_uuid();
  v_customer_b uuid := gen_random_uuid();
  v_repair_customer_a uuid := gen_random_uuid();
  v_repair_customer_b uuid := gen_random_uuid();
  v_device_a_hidden uuid := gen_random_uuid();
  v_device_a_visible uuid := gen_random_uuid();
  v_device_b uuid := gen_random_uuid();
  v_device_unlinked uuid := gen_random_uuid();
  v_order_a_hidden uuid := gen_random_uuid();
  v_order_a_visible uuid := gen_random_uuid();
  v_order_b uuid := gen_random_uuid();
  v_order_unlinked uuid := gen_random_uuid();
  v_public_a_hidden uuid := gen_random_uuid();
  v_public_a_visible uuid := gen_random_uuid();
  v_public_b uuid := gen_random_uuid();
  v_public_unlinked uuid := gen_random_uuid();
begin
  insert into auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  ) values
    (
      v_admin,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      replace(v_admin::text, '-', '') || '@example.invalid',
      '',
      now(),
      '{"provider":"email","providers":["email"],"role":"admin"}'::jsonb,
      '{"first_name":"Portal","last_name":"Admin"}'::jsonb,
      now(),
      now()
    ),
    (
      v_technician,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      replace(v_technician::text, '-', '') || '@example.invalid',
      '',
      now(),
      '{"provider":"email","providers":["email"],"role":"tecnico"}'::jsonb,
      '{"first_name":"Portal","last_name":"Tecnico"}'::jsonb,
      now(),
      now()
    ),
    (
      v_customer_a,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      replace(v_customer_a::text, '-', '') || '@example.invalid',
      '',
      now(),
      '{"provider":"email","providers":["email"],"role":"customer"}'::jsonb,
      '{"first_name":"Portal","last_name":"Customer A"}'::jsonb,
      now(),
      now()
    ),
    (
      v_customer_b,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      replace(v_customer_b::text, '-', '') || '@example.invalid',
      '',
      now(),
      '{"provider":"email","providers":["email"],"role":"customer"}'::jsonb,
      '{"first_name":"Portal","last_name":"Customer B"}'::jsonb,
      now(),
      now()
    );

  -- Keep the fixture independent from auth trigger implementation details.
  update public.profiles
  set role = case id
    when v_admin then 'admin'
    when v_technician then 'tecnico'
    else 'customer'
  end,
  account_status = 'active'
  where id in (v_admin, v_technician, v_customer_a, v_customer_b);

  update public.profiles
  set
    first_name = 'NombreUnicoPortalA',
    last_name = 'ApellidoUnicoPortalA',
    full_name = '',
    phone = '+54 9 3571-55-1234'
  where id = v_customer_a;

  if (
    select count(*)
    from public.profiles
    where id in (v_admin, v_technician, v_customer_a, v_customer_b)
  ) <> 4 then
    raise exception 'test profile setup failed';
  end if;

  insert into public.repair_access_customers (
    id, full_name, source, created_by
  ) values
    (v_repair_customer_a, 'Synthetic Repair Customer A', 'manual', v_admin),
    (v_repair_customer_b, 'Synthetic Repair Customer B', 'manual', v_admin);

  insert into public.repair_access_devices (
    id,
    customer_id,
    device_type,
    brand,
    model,
    created_by,
    updated_by
  ) values
    (
      v_device_a_hidden,
      v_repair_customer_a,
      'Televisor',
      'Marca A',
      'Modelo oculto',
      v_admin,
      v_admin
    ),
    (
      v_device_a_visible,
      v_repair_customer_a,
      'Notebook',
      'Marca A',
      'Modelo visible',
      v_admin,
      v_admin
    ),
    (
      v_device_b,
      v_repair_customer_b,
      'Monitor',
      'Marca B',
      'Modelo B',
      v_admin,
      v_admin
    ),
    (
      v_device_unlinked,
      v_repair_customer_b,
      'Consola',
      'Marca U',
      'Modelo U',
      v_admin,
      v_admin
    );

  insert into public.repair_access_orders (
    id,
    customer_public_id,
    repair_number,
    customer_id,
    device_id,
    intake_date,
    issue_reported,
    technical_diagnosis,
    internal_observations,
    budget_amount,
    budgeted_at,
    status,
    created_by,
    updated_by
  ) values
    (
      v_order_a_hidden,
      v_public_a_hidden,
      'TEST-A-HIDDEN-' || left(v_order_a_hidden::text, 8),
      v_repair_customer_a,
      v_device_a_hidden,
      current_date,
      'Synthetic issue A hidden',
      'SECRET_INTERNAL_DIAGNOSIS',
      'SECRET_INTERNAL_OBSERVATION',
      1000,
      now(),
      'en_revision',
      v_admin,
      v_admin
    ),
    (
      v_order_a_visible,
      v_public_a_visible,
      'TEST-A-VISIBLE-' || left(v_order_a_visible::text, 8),
      v_repair_customer_a,
      v_device_a_visible,
      current_date - 1,
      'Synthetic issue A visible',
      'SECRET_INTERNAL_DIAGNOSIS',
      'SECRET_INTERNAL_OBSERVATION',
      2000,
      now(),
      'presupuestado',
      v_admin,
      v_admin
    ),
    (
      v_order_b,
      v_public_b,
      'TEST-B-' || left(v_order_b::text, 8),
      v_repair_customer_b,
      v_device_b,
      current_date,
      'Synthetic issue B',
      'SECRET_INTERNAL_DIAGNOSIS',
      'SECRET_INTERNAL_OBSERVATION',
      3000,
      now(),
      'pendiente_revision',
      v_admin,
      v_admin
    ),
    (
      v_order_unlinked,
      v_public_unlinked,
      'TEST-UNLINKED-' || left(v_order_unlinked::text, 8),
      v_repair_customer_b,
      v_device_unlinked,
      current_date,
      'Synthetic unlinked issue',
      'SECRET_INTERNAL_DIAGNOSIS',
      'SECRET_INTERNAL_OBSERVATION',
      null,
      null,
      'pendiente_revision',
      v_admin,
      v_admin
    );

  insert into customer_repair_portal_test_context values (
    v_admin,
    v_technician,
    v_customer_a,
    v_customer_b,
    v_order_a_hidden,
    v_order_a_visible,
    v_order_b,
    v_order_unlinked,
    v_public_a_hidden,
    v_public_a_visible,
    v_public_b,
    v_public_unlinked
  );
end
$setup$;

-- Criterion 10: an administrator can link old or new repairs.
select set_config(
  'request.jwt.claim.sub',
  (select admin_id::text from customer_repair_portal_test_context),
  true
);
set local role authenticated;

do $admin_setup$
declare
  ctx customer_repair_portal_test_context%rowtype;
  link_result jsonb;
begin
  select * into ctx from customer_repair_portal_test_context;

  link_result := public.link_repair_to_storefront_customer(
    ctx.order_a_hidden_id,
    ctx.customer_a_id
  );
  perform public.link_repair_to_storefront_customer(
    ctx.order_a_visible_id,
    ctx.customer_a_id
  );
  perform public.link_repair_to_storefront_customer(
    ctx.order_b_id,
    ctx.customer_b_id
  );

  if not coalesce((link_result ->> 'linked')::boolean, false) then
    raise exception 'criterion 10 failed: admin link RPC did not link';
  end if;

  if (
    select customer_user_id
    from public.repair_access_orders
    where id = ctx.order_a_hidden_id
  ) is distinct from ctx.customer_a_id then
    raise exception 'criterion 10 failed: UUID ownership was not persisted';
  end if;

  if not exists (
    select 1
    from public.search_storefront_customers_for_repair(
      'NombreUnicoPortalA',
      5
    ) as result
    where result.id = ctx.customer_a_id
      and result.full_name = 'NombreUnicoPortalA ApellidoUnicoPortalA'
  ) then
    raise exception
      'admin search failed: first_name or display-name fallback was not used';
  end if;

  if not exists (
    select 1
    from public.search_storefront_customers_for_repair(
      'ApellidoUnicoPortalA',
      5
    ) as result
    where result.id = ctx.customer_a_id
  ) then
    raise exception 'admin search failed: last_name was not searched';
  end if;

  if not exists (
    select 1
    from public.search_storefront_customers_for_repair('3571551234', 5)
      as result
    where result.id = ctx.customer_a_id
  ) then
    raise exception 'admin search failed: normalized phone was not searched';
  end if;

  perform public.update_repair_customer_portal(
    ctx.order_a_hidden_id,
    'Avance público de prueba',
    'Próximo paso público',
    false,
    false,
    null,
    null,
    true
  );

  -- A published budget that is later hidden must disappear completely from
  -- both the current payload and every previously customer-visible event.
  perform public.update_repair_customer_portal(
    ctx.order_a_hidden_id,
    'Avance público de prueba',
    'Próximo paso público',
    false,
    true,
    'REVOKED_BUDGET_DESCRIPTION',
    current_date + 5,
    true
  );

  perform public.update_repair_customer_portal(
    ctx.order_a_hidden_id,
    'PUBLIC_PROGRESS_AFTER_BUDGET_HIDE',
    'Próximo paso público',
    false,
    false,
    null,
    null,
    true
  );

  if exists (
    select 1
    from public.repair_customer_updates
    where repair_order_id = ctx.order_a_hidden_id
      and event_type = 'budget'
      and visible_to_customer
  ) then
    raise exception
      'privacy regression: hidden budget retained a visible timeline event';
  end if;

  perform public.update_repair_customer_portal(
    ctx.order_a_visible_id,
    'Presupuesto público de prueba',
    'Esperar contacto del local',
    true,
    true,
    'Trabajo público presupuestado',
    current_date + 7,
    true
  );

  perform public.update_repair_customer_portal(
    ctx.order_b_id,
    'Avance exclusivo del cliente B',
    null,
    false,
    false,
    null,
    null,
    true
  );

end
$admin_setup$;

reset role;

-- Synthetic timeline fixtures are inserted by the test owner. In production,
-- append-only rows are created exclusively by the privileged RPCs/triggers.
do $timeline_setup$
declare
  ctx customer_repair_portal_test_context%rowtype;
begin
  select * into ctx from customer_repair_portal_test_context;

  insert into public.repair_customer_updates (
    repair_order_id,
    event_type,
    status,
    title,
    public_message,
    visible_to_customer,
    created_by,
    created_at
  ) values
    (
      ctx.order_a_hidden_id,
      'progress',
      'en_revision',
      'Actualización pública anterior',
      'PUBLIC_UPDATE_OLDER',
      true,
      ctx.admin_id,
      now() - interval '2 hours'
    ),
    (
      ctx.order_a_hidden_id,
      'progress',
      'en_revision',
      'Actualización pública posterior',
      'PUBLIC_UPDATE_NEWER',
      true,
      ctx.admin_id,
      now() - interval '1 hour'
    ),
    (
      ctx.order_a_hidden_id,
      'progress',
      'en_revision',
      'Actualización no publicada',
      'SECRET_HIDDEN_UPDATE',
      false,
      ctx.admin_id,
      now() - interval '30 minutes'
    );
end
$timeline_setup$;

-- A technician must be able to update only the new public portal fields through
-- the authorized RPC without being blocked by enforce_technician_repair_update.
select set_config(
  'request.jwt.claim.sub',
  (select technician_id::text from customer_repair_portal_test_context),
  true
);
set local role authenticated;

do $technician_update$
declare
  ctx customer_repair_portal_test_context%rowtype;
  result_payload jsonb;
begin
  select * into ctx from customer_repair_portal_test_context;

  result_payload := public.update_repair_customer_portal(
    ctx.order_a_hidden_id,
    'Avance público actualizado por técnico',
    'Próximo paso público',
    false,
    false,
    null,
    null,
    true
  );

  if result_payload ->> 'public_progress'
    <> 'Avance público actualizado por técnico' then
    raise exception 'technician portal RPC was blocked or returned bad data';
  end if;
end
$technician_update$;

reset role;

-- Criteria 1, 2, 4-9, 11, 13 and 14 as customer A.
select set_config(
  'request.jwt.claim.sub',
  (select customer_a_id::text from customer_repair_portal_test_context),
  true
);
set local role authenticated;

do $customer_a_checks$
declare
  ctx customer_repair_portal_test_context%rowtype;
  list_payload jsonb;
  hidden_detail jsonb;
  visible_detail jsonb;
  foreign_detail jsonb;
  first_page jsonb;
  second_page jsonb;
  direct_rows bigint;
  updated_rows bigint;
begin
  select * into ctx from customer_repair_portal_test_context;

  -- Criterion 14: real RLS, not a frontend filter.
  select count(*) into direct_rows
  from public.repair_access_orders;
  if direct_rows <> 0 then
    raise exception 'criterion 14 failed: raw repair rows visible to customer';
  end if;

  select count(*) into direct_rows
  from public.repair_customer_updates;
  if direct_rows <> 0 then
    raise exception 'criterion 14 failed: raw update rows visible to customer';
  end if;

  -- Criterion 4: customer cannot update either raw table.
  update public.repair_access_orders
  set public_progress = 'UNAUTHORIZED_CUSTOMER_WRITE'
  where id = ctx.order_a_hidden_id;
  get diagnostics updated_rows = row_count;
  if updated_rows <> 0 then
    raise exception 'criterion 4 failed: customer updated a repair';
  end if;

  begin
    update public.repair_customer_updates
    set title = 'UNAUTHORIZED_CUSTOMER_WRITE';
    raise exception
      'criterion 4 failed: customer had UPDATE privilege on timeline';
  exception
    when insufficient_privilege then
      null;
  end;

  -- Criterion 4: the real administrative RPC surface must also reject customers.
  begin
    perform public.update_repair_customer_portal(
      ctx.order_a_hidden_id,
      'UNAUTHORIZED_CUSTOMER_RPC_WRITE',
      null,
      false,
      false,
      null,
      null,
      false
    );
    raise exception
      'criterion 4 failed: customer invoked update_repair_customer_portal';
  exception
    when sqlstate '42501' then
      null;
  end;

  begin
    perform public.link_repair_to_storefront_customer(
      ctx.order_a_hidden_id,
      ctx.customer_a_id
    );
    raise exception
      'criterion 4 failed: customer invoked link_repair_to_storefront_customer';
  exception
    when sqlstate '42501' then
      null;
  end;

  begin
    perform *
    from public.search_storefront_customers_for_repair('customer', 5);
    raise exception
      'criterion 4 failed: customer invoked search_storefront_customers_for_repair';
  exception
    when sqlstate '42501' then
      null;
  end;

  list_payload := public.get_my_customer_repairs(null, null, 12);

  -- Criteria 1, 2 and 11.
  if jsonb_array_length(list_payload -> 'items') <> 2 then
    raise exception
      'criteria 1/2/11 failed: customer A must see exactly two linked repairs';
  end if;
  if (list_payload -> 'items') @> jsonb_build_array(
    jsonb_build_object('public_id', ctx.public_b_id)
  ) then
    raise exception 'criterion 2 failed: customer A saw customer B repair';
  end if;
  if (list_payload -> 'items') @> jsonb_build_array(
    jsonb_build_object('public_id', ctx.public_unlinked_id)
  ) then
    raise exception 'criterion 11 failed: unlinked repair was visible';
  end if;

  hidden_detail := public.get_my_customer_repair(ctx.public_a_hidden_id);
  visible_detail := public.get_my_customer_repair(ctx.public_a_visible_id);
  foreign_detail := public.get_my_customer_repair(ctx.public_b_id);

  if hidden_detail is null or visible_detail is null then
    raise exception 'criterion 1 failed: own repair detail was not visible';
  end if;

  -- Criterion 13: manipulated public UUID is still ownership checked.
  if foreign_detail is not null then
    raise exception 'criterion 13 failed: IDOR returned another customer repair';
  end if;

  -- Criterion 5: sensitive operational fields never enter the DTO.
  if hidden_detail::text like '%SECRET_INTERNAL_%'
    or hidden_detail ? 'technical_diagnosis'
    or hidden_detail ? 'internal_observations'
    or hidden_detail ? 'notes'
    or hidden_detail ? 'id' then
    raise exception 'criterion 5 failed: internal data leaked';
  end if;

  -- Criteria 6 and 7: budget key is omitted, not merely null, when hidden.
  if hidden_detail ? 'budget' then
    raise exception 'criterion 6 failed: hidden budget key was returned';
  end if;
  if hidden_detail::text like '%REVOKED_BUDGET_DESCRIPTION%' then
    raise exception
      'criterion 6 failed: revoked budget description remained in timeline';
  end if;
  if hidden_detail::text not like '%PUBLIC_PROGRESS_AFTER_BUDGET_HIDE%' then
    raise exception
      'timeline regression: progress changed while hiding budget was not published';
  end if;
  if not (visible_detail ? 'budget')
    or visible_detail #>> '{budget,amount}' <> '2000' then
    raise exception 'criterion 7 failed: visible budget missing or incorrect';
  end if;

  -- Criterion 8: invisible timeline records never enter the response.
  if hidden_detail::text like '%SECRET_HIDDEN_UPDATE%' then
    raise exception 'criterion 8 failed: hidden update leaked';
  end if;

  -- Criterion 9: timeline is chronologically ascending.
  if exists (
    select 1
    from (
      select
        (entry.value ->> 'created_at')::timestamptz as created_at,
        lag((entry.value ->> 'created_at')::timestamptz)
          over (order by entry.ordinality) as previous_created_at
      from jsonb_array_elements(hidden_detail -> 'updates')
        with ordinality as entry(value, ordinality)
    ) as ordered_updates
    where previous_created_at > created_at
  ) then
    raise exception 'criterion 9 failed: updates are not ascending';
  end if;

  -- Keyset pagination must not repeat the first item.
  first_page := public.get_my_customer_repairs(null, null, 1);
  if first_page -> 'next_cursor' is null
    or first_page -> 'next_cursor' = 'null'::jsonb then
    raise exception 'keyset pagination did not return a cursor';
  end if;

  second_page := public.get_my_customer_repairs(
    (first_page #>> '{next_cursor,intake_date}')::date,
    (first_page #>> '{next_cursor,public_id}')::uuid,
    1
  );
  if first_page #>> '{items,0,public_id}'
    = second_page #>> '{items,0,public_id}' then
    raise exception 'keyset pagination repeated an item';
  end if;
end
$customer_a_checks$;

reset role;

-- Customer B receives exactly its own repair and cannot open customer A URLs.
select set_config(
  'request.jwt.claim.sub',
  (select customer_b_id::text from customer_repair_portal_test_context),
  true
);
set local role authenticated;

do $customer_b_checks$
declare
  ctx customer_repair_portal_test_context%rowtype;
  payload jsonb;
begin
  select * into ctx from customer_repair_portal_test_context;
  payload := public.get_my_customer_repairs(null, null, 12);

  if jsonb_array_length(payload -> 'items') <> 1
    or payload #>> '{items,0,public_id}' <> ctx.public_b_id::text then
    raise exception 'criterion 2 failed: customer B isolation is incorrect';
  end if;

  if public.get_my_customer_repair(ctx.public_a_hidden_id) is not null then
    raise exception 'criterion 13 failed: customer B opened customer A URL';
  end if;
end
$customer_b_checks$;

reset role;

-- Criterion 3 plus static security contract for wrappers/private helpers.
do $security_contract$
declare
  public_function_name text;
  private_function_name text;
begin
  foreach public_function_name in array array[
    'get_my_customer_repairs',
    'get_my_customer_repair',
    'get_my_customer_repairs_summary',
    'search_storefront_customers_for_repair',
    'link_repair_to_storefront_customer',
    'update_repair_customer_portal'
  ] loop
    if exists (
      select 1
      from pg_proc as procedure
      join pg_namespace as namespace
        on namespace.oid = procedure.pronamespace
      where namespace.nspname = 'public'
        and procedure.proname = public_function_name
        and procedure.prosecdef
    ) then
      raise exception
        'public wrapper % must remain SECURITY INVOKER',
        public_function_name;
    end if;
  end loop;

  foreach private_function_name in array array[
    'get_my_customer_repairs',
    'get_my_customer_repair',
    'get_my_customer_repairs_summary',
    'search_storefront_customers_for_repair',
    'link_repair_to_storefront_customer',
    'update_repair_customer_portal'
  ] loop
    if exists (
      select 1
      from pg_proc as procedure
      join pg_namespace as namespace
        on namespace.oid = procedure.pronamespace
      where namespace.nspname = 'private'
        and procedure.proname = private_function_name
        and not procedure.prosecdef
    ) then
      raise exception
        'private helper % must remain SECURITY DEFINER',
        private_function_name;
    end if;
  end loop;

  if has_function_privilege(
    'anon',
    'public.get_my_customer_repairs(date,uuid,integer)',
    'execute'
  ) or has_function_privilege(
    'anon',
    'public.get_my_customer_repair(uuid)',
    'execute'
  ) or has_function_privilege(
    'anon',
    'public.get_my_customer_repairs_summary()',
    'execute'
  ) then
    raise exception
      'criterion 3 failed: anonymous role can execute customer repair RPC';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'repair_access_orders',
        'repair_customer_updates'
      )
      and roles @> array['authenticated']::name[]
      and coalesce(qual, '') like '%auth.uid()%'
  ) then
    raise exception
      'customer ownership must not expose either raw table directly';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'repair_customer_updates'
      and column_name = 'internal_message'
  ) then
    raise exception 'repair_customer_updates must not contain internal_message';
  end if;
end
$security_contract$;

-- Criterion 12 (responsive/mobile rendering) is a mandatory authenticated
-- browser QA gate at 375 px after deployment; it cannot be asserted in Postgres.

select 'customer repair portal security contract: ok' as result;

rollback;
