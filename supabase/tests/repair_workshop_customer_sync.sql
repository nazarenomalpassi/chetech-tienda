-- Transactional regression contract for workshop-to-customer publication.
--
-- Run only against a local, development or disposable branch after applying
-- 20260723211521_publish_workshop_fields_to_customer_portal.sql and the
-- customer repair portal migrations that precede it.
--
-- The fixtures are synthetic and the final ROLLBACK guarantees that no test
-- users, repairs, events or audit rows persist.

begin;

create temporary table repair_workshop_customer_sync_context (
  admin_id uuid not null,
  customer_id uuid not null,
  repair_customer_id uuid not null,
  linked_order_id uuid not null,
  linked_public_id uuid not null,
  unlinked_order_id uuid not null,
  unlinked_public_id uuid not null
) on commit drop;

grant select on repair_workshop_customer_sync_context to authenticated;

do $contract_setup$
begin
  if not exists (
    select 1
    from pg_trigger as t
    join pg_class as c
      on c.oid = t.tgrelid
    join pg_namespace as n
      on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'repair_access_orders'
      and t.tgname = 'sync_repair_workshop_customer_fields'
      and not t.tgisinternal
  ) then
    raise exception
      'workshop sync migration missing: before-update trigger not found';
  end if;

  if not exists (
    select 1
    from pg_trigger as t
    join pg_class as c
      on c.oid = t.tgrelid
    join pg_namespace as n
      on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'repair_access_orders'
      and t.tgname = 'publish_repair_workshop_customer_update'
      and not t.tgisinternal
  ) then
    raise exception
      'workshop sync migration missing: after-update trigger not found';
  end if;
end
$contract_setup$;

do $fixture_setup$
declare
  v_admin uuid := gen_random_uuid();
  v_customer uuid := gen_random_uuid();
  v_repair_customer uuid := gen_random_uuid();
  v_linked_device uuid := gen_random_uuid();
  v_unlinked_device uuid := gen_random_uuid();
  v_linked_order uuid := gen_random_uuid();
  v_linked_public uuid := gen_random_uuid();
  v_unlinked_order uuid := gen_random_uuid();
  v_unlinked_public uuid := gen_random_uuid();
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
      '{"first_name":"Workshop","last_name":"Admin"}'::jsonb,
      now(),
      now()
    ),
    (
      v_customer,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      replace(v_customer::text, '-', '') || '@example.invalid',
      '',
      now(),
      '{"provider":"email","providers":["email"],"role":"customer"}'::jsonb,
      '{"first_name":"Workshop","last_name":"Customer"}'::jsonb,
      now(),
      now()
    );

  -- Keep the fixture independent from auth trigger implementation details.
  update public.profiles
  set
    role = case
      when id = v_admin then 'admin'
      else 'customer'
    end,
    account_status = 'active'
  where id in (v_admin, v_customer);

  if (
    select count(*)
    from public.profiles
    where id in (v_admin, v_customer)
  ) <> 2 then
    raise exception 'workshop sync fixture profile setup failed';
  end if;

  insert into public.repair_access_customers (
    id,
    full_name,
    source,
    created_by
  ) values (
    v_repair_customer,
    'Synthetic Workshop Customer',
    'manual',
    v_admin
  );

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
      v_linked_device,
      v_repair_customer,
      'Televisor',
      'Synthetic Brand',
      'Linked Model',
      v_admin,
      v_admin
    ),
    (
      v_unlinked_device,
      v_repair_customer,
      'Notebook',
      'Synthetic Brand',
      'Unlinked Model',
      v_admin,
      v_admin
    );

  insert into public.repair_access_orders (
    id,
    customer_public_id,
    repair_number,
    customer_id,
    device_id,
    customer_user_id,
    intake_date,
    issue_reported,
    status,
    created_by,
    updated_by,
    updated_at
  ) values
    (
      v_linked_order,
      v_linked_public,
      'TEST-WORKSHOP-LINKED-' || left(v_linked_order::text, 8),
      v_repair_customer,
      v_linked_device,
      v_customer,
      current_date,
      'Synthetic linked workshop issue',
      'en_revision',
      v_admin,
      v_admin,
      now()
    ),
    (
      v_unlinked_order,
      v_unlinked_public,
      'TEST-WORKSHOP-UNLINKED-' || left(v_unlinked_order::text, 8),
      v_repair_customer,
      v_unlinked_device,
      null,
      current_date,
      'Synthetic unlinked workshop issue',
      'en_revision',
      v_admin,
      v_admin,
      now()
    );

  insert into repair_workshop_customer_sync_context values (
    v_admin,
    v_customer,
    v_repair_customer,
    v_linked_order,
    v_linked_public,
    v_unlinked_order,
    v_unlinked_public
  );
end
$fixture_setup$;

-- Exercise the same atomic technical save used by the full administrative
-- repair form. The new column-scoped triggers must publish only the three
-- approved workshop values.
select set_config(
  'request.jwt.claim.sub',
  (select admin_id::text from repair_workshop_customer_sync_context),
  true
);
set local role authenticated;

do $initial_workshop_save$
declare
  ctx repair_workshop_customer_sync_context%rowtype;
  save_result jsonb;
  save_payload jsonb;
begin
  select * into ctx
  from repair_workshop_customer_sync_context;

  save_payload := jsonb_build_object(
    'technician_name', 'PRIVATE_TECHNICIAN_NAME',
    'technical_diagnosis', 'PRIVATE_DIAGNOSIS_INITIAL',
    'repair_progress', 'PUBLIC_PROGRESS_INITIAL',
    'internal_observations', 'PRIVATE_INTERNAL_NOTES_INITIAL',
    'used_parts', 'PRIVATE_USED_PARTS_INITIAL',
    'work_performed', 'PRIVATE_WORK_PERFORMED_INITIAL',
    'budget_amount', 15000,
    'budget_detail', 'PUBLIC_BUDGET_DESCRIPTION_INITIAL',
    'budget_response_notes', 'PRIVATE_BUDGET_RESPONSE_NOTES',
    'budget_response_at', null,
    'budgeted_at', now(),
    'final_amount', 15000,
    'payment_method', null,
    'payment_notes', 'PRIVATE_PAYMENT_NOTES',
    'is_paid', false,
    'paid_at', null,
    'finished_at', null,
    'warranty_days', 0,
    'warranty_conditions', null,
    'status', 'presupuestado'
  );

  save_result := public.save_repair_access_technical(
    ctx.linked_order_id,
    save_payload
  );

  if save_result ->> 'id' <> ctx.linked_order_id::text then
    raise exception 'initial workshop save returned the wrong repair id';
  end if;
end
$initial_workshop_save$;

reset role;

do $mapped_field_and_event_checks$
declare
  ctx repair_workshop_customer_sync_context%rowtype;
  linked_order public.repair_access_orders%rowtype;
begin
  select * into ctx
  from repair_workshop_customer_sync_context;

  select * into linked_order
  from public.repair_access_orders
  where id = ctx.linked_order_id;

  if linked_order.public_progress
      is distinct from 'PUBLIC_PROGRESS_INITIAL'
    or linked_order.public_budget_description
      is distinct from 'PUBLIC_BUDGET_DESCRIPTION_INITIAL'
    or not linked_order.budget_visible_to_customer
    or linked_order.budget_amount is distinct from 15000::numeric then
    raise exception
      'mapped fields failed: workshop values did not reach public columns';
  end if;

  if linked_order.last_customer_visible_update_at is null then
    raise exception
      'mapped fields failed: linked repair was not marked customer-visible';
  end if;

  if (
    select count(*)
    from public.repair_customer_updates
    where repair_order_id = ctx.linked_order_id
      and event_type = 'progress'
      and visible_to_customer
      and public_message = 'PUBLIC_PROGRESS_INITIAL'
  ) <> 1 then
    raise exception
      'progress event failed: expected exactly one public progress event';
  end if;

  if (
    select count(*)
    from public.repair_customer_updates
    where repair_order_id = ctx.linked_order_id
      and event_type = 'budget'
      and visible_to_customer
      and public_message = 'PUBLIC_BUDGET_DESCRIPTION_INITIAL'
  ) <> 1 then
    raise exception
      'budget event failed: expected exactly one public budget event';
  end if;

  if exists (
    select 1
    from public.repair_customer_updates
    where repair_order_id = ctx.linked_order_id
      and (
        coalesce(public_message, '') like '%PRIVATE_%'
        or title like '%PRIVATE_%'
      )
  ) then
    raise exception
      'privacy regression: private workshop content entered public events';
  end if;
end
$mapped_field_and_event_checks$;

-- Confirm the customer DTO contains the approved values but none of the
-- diagnostic, internal, payment or technician values saved in the same call.
select set_config(
  'request.jwt.claim.sub',
  (select customer_id::text from repair_workshop_customer_sync_context),
  true
);
set local role authenticated;

do $initial_customer_payload_checks$
declare
  ctx repair_workshop_customer_sync_context%rowtype;
  detail_payload jsonb;
begin
  select * into ctx
  from repair_workshop_customer_sync_context;

  detail_payload := public.get_my_customer_repair(
    ctx.linked_public_id
  );

  if detail_payload ->> 'public_progress'
      <> 'PUBLIC_PROGRESS_INITIAL'
    or detail_payload #>> '{budget,amount}' <> '15000'
    or detail_payload #>> '{budget,description}'
      <> 'PUBLIC_BUDGET_DESCRIPTION_INITIAL' then
    raise exception
      'customer payload failed: mapped progress or budget is missing';
  end if;

  if detail_payload::text like '%PRIVATE_%'
    or detail_payload ? 'technical_diagnosis'
    or detail_payload ? 'internal_observations'
    or detail_payload ? 'payment_notes'
    or detail_payload ? 'technician_name'
    or detail_payload ? 'used_parts'
    or detail_payload ? 'work_performed' then
    raise exception
      'privacy regression: internal workshop data reached customer DTO';
  end if;
end
$initial_customer_payload_checks$;

reset role;

-- Re-saving the same customer-visible values must not append duplicate
-- progress/budget events or duplicate auto-publication audit entries.
select set_config(
  'request.jwt.claim.sub',
  (select admin_id::text from repair_workshop_customer_sync_context),
  true
);
set local role authenticated;

do $idempotent_resave$
declare
  ctx repair_workshop_customer_sync_context%rowtype;
begin
  select * into ctx
  from repair_workshop_customer_sync_context;

  perform public.save_repair_access_technical(
    ctx.linked_order_id,
    jsonb_build_object(
      'technician_name', 'PRIVATE_TECHNICIAN_NAME',
      'technical_diagnosis', 'PRIVATE_DIAGNOSIS_INITIAL',
      'repair_progress', 'PUBLIC_PROGRESS_INITIAL',
      'internal_observations', 'PRIVATE_INTERNAL_NOTES_INITIAL',
      'used_parts', 'PRIVATE_USED_PARTS_INITIAL',
      'work_performed', 'PRIVATE_WORK_PERFORMED_INITIAL',
      'budget_amount', 15000,
      'budget_detail', 'PUBLIC_BUDGET_DESCRIPTION_INITIAL',
      'budget_response_notes', 'PRIVATE_BUDGET_RESPONSE_NOTES',
      'budget_response_at', null,
      'budgeted_at', now(),
      'final_amount', 15000,
      'payment_method', null,
      'payment_notes', 'PRIVATE_PAYMENT_NOTES',
      'is_paid', false,
      'paid_at', null,
      'finished_at', null,
      'warranty_days', 0,
      'warranty_conditions', null,
      'status', 'presupuestado'
    )
  );
end
$idempotent_resave$;

reset role;

do $idempotency_checks$
declare
  ctx repair_workshop_customer_sync_context%rowtype;
begin
  select * into ctx
  from repair_workshop_customer_sync_context;

  if (
    select count(*)
    from public.repair_customer_updates
    where repair_order_id = ctx.linked_order_id
      and event_type = 'progress'
  ) <> 1 then
    raise exception
      'idempotency failed: same-value save duplicated progress event';
  end if;

  if (
    select count(*)
    from public.repair_customer_updates
    where repair_order_id = ctx.linked_order_id
      and event_type = 'budget'
  ) <> 1 then
    raise exception
      'idempotency failed: same-value save duplicated budget event';
  end if;

  if (
    select count(*)
    from public.audit_logs
    where entity_id = ctx.linked_order_id::text
      and changes ->> 'source' = 'workshop_auto_sync'
  ) <> 1 then
    raise exception
      'idempotency failed: same-value save duplicated auto-publish audit';
  end if;
end
$idempotency_checks$;

-- Fields outside the three-column publication allow-list must neither change
-- customer-visible values nor create customer events.
select set_config(
  'request.jwt.claim.sub',
  (select admin_id::text from repair_workshop_customer_sync_context),
  true
);
set local role authenticated;

do $private_only_update$
declare
  ctx repair_workshop_customer_sync_context%rowtype;
begin
  select * into ctx
  from repair_workshop_customer_sync_context;

  update public.repair_access_orders
  set
    technical_diagnosis = 'PRIVATE_DIAGNOSIS_CHANGED',
    internal_observations = 'PRIVATE_INTERNAL_NOTES_CHANGED',
    updated_by = ctx.admin_id,
    updated_at = clock_timestamp()
  where id = ctx.linked_order_id;
end
$private_only_update$;

reset role;

do $private_only_update_checks$
declare
  ctx repair_workshop_customer_sync_context%rowtype;
  linked_order public.repair_access_orders%rowtype;
begin
  select * into ctx
  from repair_workshop_customer_sync_context;

  select * into linked_order
  from public.repair_access_orders
  where id = ctx.linked_order_id;

  if linked_order.public_progress
      is distinct from 'PUBLIC_PROGRESS_INITIAL'
    or linked_order.public_budget_description
      is distinct from 'PUBLIC_BUDGET_DESCRIPTION_INITIAL' then
    raise exception
      'privacy regression: private-only update changed public fields';
  end if;

  if (
    select count(*)
    from public.repair_customer_updates
    where repair_order_id = ctx.linked_order_id
      and event_type in ('progress', 'budget')
  ) <> 2 then
    raise exception
      'privacy regression: private-only update created a customer event';
  end if;

  if linked_order.public_progress like '%PRIVATE_%'
    or linked_order.public_budget_description like '%PRIVATE_%' then
    raise exception
      'privacy regression: diagnosis or internal notes were mirrored';
  end if;
end
$private_only_update_checks$;

-- Dropping the workshop amount to zero must hide the current budget and every
-- previously published budget event. The public progress is unchanged.
select set_config(
  'request.jwt.claim.sub',
  (select admin_id::text from repair_workshop_customer_sync_context),
  true
);
set local role authenticated;

do $zero_amount_save$
declare
  ctx repair_workshop_customer_sync_context%rowtype;
begin
  select * into ctx
  from repair_workshop_customer_sync_context;

  perform public.save_repair_access_technical(
    ctx.linked_order_id,
    jsonb_build_object(
      'technician_name', 'PRIVATE_TECHNICIAN_NAME',
      'technical_diagnosis', 'PRIVATE_DIAGNOSIS_CHANGED',
      'repair_progress', 'PUBLIC_PROGRESS_INITIAL',
      'internal_observations', 'PRIVATE_INTERNAL_NOTES_CHANGED',
      'used_parts', 'PRIVATE_USED_PARTS_INITIAL',
      'work_performed', 'PRIVATE_WORK_PERFORMED_INITIAL',
      'budget_amount', 0,
      'budget_detail', 'PUBLIC_BUDGET_DESCRIPTION_INITIAL',
      'budget_response_notes', 'PRIVATE_BUDGET_RESPONSE_NOTES',
      'budget_response_at', null,
      'budgeted_at', null,
      'final_amount', 0,
      'payment_method', null,
      'payment_notes', 'PRIVATE_PAYMENT_NOTES',
      'is_paid', false,
      'paid_at', null,
      'finished_at', null,
      'warranty_days', 0,
      'warranty_conditions', null,
      'status', 'presupuestado'
    )
  );
end
$zero_amount_save$;

reset role;

do $zero_amount_database_checks$
declare
  ctx repair_workshop_customer_sync_context%rowtype;
  linked_order public.repair_access_orders%rowtype;
begin
  select * into ctx
  from repair_workshop_customer_sync_context;

  select * into linked_order
  from public.repair_access_orders
  where id = ctx.linked_order_id;

  if linked_order.budget_visible_to_customer
    or linked_order.budget_amount is distinct from 0::numeric then
    raise exception
      'zero-amount regression: current budget remained public';
  end if;

  if exists (
    select 1
    from public.repair_customer_updates
    where repair_order_id = ctx.linked_order_id
      and event_type = 'budget'
      and visible_to_customer
  ) then
    raise exception
      'zero-amount regression: historical budget event remained visible';
  end if;

  if (
    select count(*)
    from public.repair_customer_updates
    where repair_order_id = ctx.linked_order_id
      and event_type = 'progress'
  ) <> 1 then
    raise exception
      'zero-amount regression: unchanged progress was republished';
  end if;
end
$zero_amount_database_checks$;

select set_config(
  'request.jwt.claim.sub',
  (select customer_id::text from repair_workshop_customer_sync_context),
  true
);
set local role authenticated;

do $zero_amount_customer_checks$
declare
  ctx repair_workshop_customer_sync_context%rowtype;
  detail_payload jsonb;
begin
  select * into ctx
  from repair_workshop_customer_sync_context;

  detail_payload := public.get_my_customer_repair(
    ctx.linked_public_id
  );

  if detail_payload ? 'budget' then
    raise exception
      'zero-amount regression: customer DTO still contains budget';
  end if;

  if detail_payload::text like '%PUBLIC_BUDGET_DESCRIPTION_INITIAL%' then
    raise exception
      'zero-amount regression: old budget description remained in timeline';
  end if;

  if detail_payload ->> 'public_progress'
      <> 'PUBLIC_PROGRESS_INITIAL' then
    raise exception
      'zero-amount regression: public progress changed unexpectedly';
  end if;
end
$zero_amount_customer_checks$;

reset role;

-- Unlinked repairs may retain the approved mirrored snapshot for later manual
-- linking, but they must publish no events, advance no customer-visible
-- timestamp and remain inaccessible to every customer.
select set_config(
  'request.jwt.claim.sub',
  (select admin_id::text from repair_workshop_customer_sync_context),
  true
);
set local role authenticated;

do $unlinked_workshop_save$
declare
  ctx repair_workshop_customer_sync_context%rowtype;
begin
  select * into ctx
  from repair_workshop_customer_sync_context;

  perform public.save_repair_access_technical(
    ctx.unlinked_order_id,
    jsonb_build_object(
      'technician_name', null,
      'technical_diagnosis', 'PRIVATE_UNLINKED_DIAGNOSIS',
      'repair_progress', 'PUBLIC_UNLINKED_PROGRESS',
      'internal_observations', 'PRIVATE_UNLINKED_NOTES',
      'used_parts', null,
      'work_performed', null,
      'budget_amount', 2500,
      'budget_detail', 'PUBLIC_UNLINKED_BUDGET',
      'budget_response_notes', null,
      'budget_response_at', null,
      'budgeted_at', now(),
      'final_amount', 2500,
      'payment_method', null,
      'payment_notes', null,
      'is_paid', false,
      'paid_at', null,
      'finished_at', null,
      'warranty_days', 0,
      'warranty_conditions', null,
      'status', 'en_revision'
    )
  );
end
$unlinked_workshop_save$;

reset role;

do $unlinked_database_checks$
declare
  ctx repair_workshop_customer_sync_context%rowtype;
  unlinked_order public.repair_access_orders%rowtype;
begin
  select * into ctx
  from repair_workshop_customer_sync_context;

  select * into unlinked_order
  from public.repair_access_orders
  where id = ctx.unlinked_order_id;

  if unlinked_order.public_progress
      is distinct from 'PUBLIC_UNLINKED_PROGRESS'
    or unlinked_order.public_budget_description
      is distinct from 'PUBLIC_UNLINKED_BUDGET'
    or not unlinked_order.budget_visible_to_customer then
    raise exception
      'unlinked regression: approved snapshot was not mirrored';
  end if;

  if unlinked_order.last_customer_visible_update_at is not null then
    raise exception
      'unlinked regression: customer-visible timestamp was advanced';
  end if;

  if exists (
    select 1
    from public.repair_customer_updates
    where repair_order_id = ctx.unlinked_order_id
  ) then
    raise exception
      'unlinked regression: customer timeline event was published';
  end if;

  if exists (
    select 1
    from public.audit_logs
    where entity_id = ctx.unlinked_order_id::text
      and changes ->> 'source' = 'workshop_auto_sync'
  ) then
    raise exception
      'unlinked regression: auto-publication audit was written';
  end if;
end
$unlinked_database_checks$;

select set_config(
  'request.jwt.claim.sub',
  (select customer_id::text from repair_workshop_customer_sync_context),
  true
);
set local role authenticated;

do $unlinked_customer_check$
declare
  ctx repair_workshop_customer_sync_context%rowtype;
begin
  select * into ctx
  from repair_workshop_customer_sync_context;

  if public.get_my_customer_repair(ctx.unlinked_public_id) is not null then
    raise exception
      'unlinked regression: customer opened an unlinked repair';
  end if;
end
$unlinked_customer_check$;

reset role;

select 'repair workshop customer sync contract: ok' as result;

rollback;
