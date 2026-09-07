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
