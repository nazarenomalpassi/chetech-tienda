-- Publish the three approved workshop fields as customer-visible.
--
-- The customer portal remains isolated from all other technical and financial
-- columns. These triggers only mirror:
--   repair_progress -> public_progress
--   budget_detail   -> public_budget_description
--   budget_amount   -> the already-gated public budget
--
-- Keeping this in the database makes publication atomic for every authorized
-- writer (administrator, technician and the guarded fallback update path).

create or replace function private.sync_repair_workshop_customer_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  clean_progress text :=
    nullif(trim(coalesce(new.repair_progress, '')), '');
  clean_budget_description text :=
    nullif(trim(coalesce(new.budget_detail, '')), '');
  visible_budget boolean := coalesce(new.budget_amount, 0) > 0;
  changed_at timestamptz := coalesce(new.updated_at, now());
  customer_visible_changed boolean;
begin
  if char_length(coalesce(clean_progress, '')) > 2000
    or char_length(coalesce(clean_budget_description, '')) > 2000 then
    raise exception 'customer_visible_repair_content_too_long'
      using errcode = '22023';
  end if;

  if visible_budget and new.budgeted_at is null then
    raise exception 'budget_date_required_before_customer_publication'
      using errcode = '22023';
  end if;

  new.public_progress := clean_progress;
  new.public_budget_description := clean_budget_description;
  new.budget_visible_to_customer := visible_budget;

  customer_visible_changed :=
    old.public_progress is distinct from new.public_progress
    or old.public_budget_description
      is distinct from new.public_budget_description
    or old.budget_visible_to_customer
      is distinct from new.budget_visible_to_customer
    or old.budget_amount is distinct from new.budget_amount;

  if customer_visible_changed and new.customer_user_id is not null then
    new.last_customer_visible_update_at := changed_at;
  end if;

  return new;
end;
$function$;

revoke all on function private.sync_repair_workshop_customer_fields()
  from public, anon, authenticated;

drop trigger if exists sync_repair_workshop_customer_fields
  on public.repair_access_orders;

create trigger sync_repair_workshop_customer_fields
before update of repair_progress, budget_amount, budget_detail
on public.repair_access_orders
for each row
execute function private.sync_repair_workshop_customer_fields();

-- The pre-existing trigger used `after update of budget_visible_to_customer`.
-- PostgreSQL evaluates that column list from the original UPDATE statement, so
-- it did not run when the BEFORE trigger above changed the visibility flag.
-- Listen to every row update and keep the transition guard in the WHEN clause.
drop trigger if exists hide_repair_budget_updates_when_hidden
  on public.repair_access_orders;

create trigger hide_repair_budget_updates_when_hidden
after update on public.repair_access_orders
for each row
when (
  old.budget_visible_to_customer
  and not new.budget_visible_to_customer
)
execute function private.hide_repair_budget_updates_when_hidden();

create or replace function private.publish_repair_workshop_customer_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := coalesce(
    (select auth.uid()),
    new.updated_by,
    new.created_by
  );
  changed_at timestamptz := coalesce(new.updated_at, now());
  progress_changed boolean :=
    old.public_progress is distinct from new.public_progress;
  budget_changed boolean :=
    old.public_budget_description
      is distinct from new.public_budget_description
    or old.budget_visible_to_customer
      is distinct from new.budget_visible_to_customer
    or old.budget_amount is distinct from new.budget_amount;
  published_fields text[] := array[]::text[];
begin
  if new.customer_user_id is null then
    return new;
  end if;

  if progress_changed then
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
      new.id,
      'progress',
      new.status,
      'Avance de la reparación',
      coalesce(
        new.public_progress,
        new.public_next_step,
        'Hay una nueva actualización disponible.'
      ),
      true,
      new.customer_action_required,
      actor_id,
      changed_at
    );

    published_fields := array_append(
      published_fields,
      'public_progress'
    );
  end if;

  if budget_changed
    and new.budget_visible_to_customer
    and coalesce(new.budget_amount, 0) > 0 then
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
      new.id,
      'budget',
      new.status,
      'Presupuesto actualizado',
      coalesce(
        new.public_budget_description,
        'El presupuesto de la reparación ya está disponible.'
      ),
      true,
      new.customer_action_required,
      actor_id,
      changed_at
    );

    published_fields := array_append(
      published_fields,
      'budget'
    );
  end if;

  if progress_changed or budget_changed then
    insert into public.audit_logs (
      entity_type,
      entity_id,
      action,
      changes,
      user_id
    ) values (
      'repair_access_orders',
      new.id::text,
      'update',
      jsonb_build_object(
        'source', 'workshop_auto_sync',
        'published_fields', to_jsonb(published_fields),
        'previous', jsonb_build_object(
          'public_progress', old.public_progress,
          'budget_amount', old.budget_amount,
          'public_budget_description',
            old.public_budget_description,
          'budget_visible_to_customer',
            old.budget_visible_to_customer
        ),
        'next', jsonb_build_object(
          'public_progress', new.public_progress,
          'budget_amount', new.budget_amount,
          'public_budget_description',
            new.public_budget_description,
          'budget_visible_to_customer',
            new.budget_visible_to_customer
        )
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
      'repair.customer_portal_auto_synced',
      'repair_access_order',
      new.id::text,
      jsonb_build_object(
        'published_fields', to_jsonb(published_fields),
        'progress_changed', progress_changed,
        'budget_changed', budget_changed
      )
    );
  end if;

  return new;
end;
$function$;

revoke all on function private.publish_repair_workshop_customer_update()
  from public, anon, authenticated;

drop trigger if exists publish_repair_workshop_customer_update
  on public.repair_access_orders;

create trigger publish_repair_workshop_customer_update
after update of repair_progress, budget_amount, budget_detail
on public.repair_access_orders
for each row
execute function private.publish_repair_workshop_customer_update();

comment on function private.sync_repair_workshop_customer_fields() is
  'Atomically mirrors the three approved workshop fields to the customer portal.';

comment on function private.publish_repair_workshop_customer_update() is
  'Publishes customer-safe progress and budget timeline events after workshop updates.';
