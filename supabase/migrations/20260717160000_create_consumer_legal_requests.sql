-- Secure intake for withdrawal and privacy requests.
-- Anonymous callers can only insert through a narrow, validated function and
-- receive the newly generated public reference. They cannot read any row.

create schema if not exists private;
create extension if not exists pgcrypto with schema extensions;

create sequence if not exists private.consumer_request_reference_seq;

create table if not exists private.consumer_requests (
  id uuid primary key default gen_random_uuid(),
  public_reference text not null unique,
  request_type text not null check (request_type in ('withdrawal', 'privacy')),
  status text not null default 'received'
    check (status in ('received', 'in_review', 'responded', 'resolved', 'rejected_with_reason')),
  first_name text not null check (char_length(first_name) between 1 and 80),
  last_name text not null check (char_length(last_name) between 1 and 80),
  contact text not null check (char_length(contact) between 3 and 160),
  contact_hash text not null,
  preferred_channel text not null check (preferred_channel in ('email', 'whatsapp', 'phone')),
  order_reference text check (order_reference is null or char_length(order_reference) <= 80),
  approximate_date date,
  product text check (product is null or char_length(product) <= 200),
  reason text check (reason is null or char_length(reason) <= 1000),
  privacy_right text check (privacy_right is null or privacy_right in ('access', 'rectification', 'deletion', 'information', 'consent')),
  fingerprint_hash text not null check (char_length(fingerprint_hash) = 64),
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  responded_at timestamptz,
  resolved_at timestamptz,
  constraint consumer_request_required_context check (
    (request_type = 'withdrawal' and product is not null and privacy_right is null)
    or
    (request_type = 'privacy' and privacy_right is not null and reason is not null)
  ),
  constraint consumer_request_rejection_reason check (
    status <> 'rejected_with_reason' or nullif(btrim(rejection_reason), '') is not null
  )
);

create table if not exists private.consumer_request_events (
  id bigint generated always as identity primary key,
  request_id uuid not null references private.consumer_requests(id) on delete cascade,
  event_type text not null check (event_type in ('received', 'status_changed', 'notification_attempted', 'notification_sent', 'notification_failed')),
  from_status text,
  to_status text,
  actor_user_id uuid,
  note text check (note is null or char_length(note) <= 1000),
  created_at timestamptz not null default now()
);

create index if not exists consumer_requests_created_idx on private.consumer_requests (created_at desc);
create index if not exists consumer_requests_status_idx on private.consumer_requests (status, created_at desc);
create index if not exists consumer_requests_fingerprint_rate_idx on private.consumer_requests (fingerprint_hash, created_at desc);
create index if not exists consumer_requests_contact_rate_idx on private.consumer_requests (contact_hash, created_at desc);
create index if not exists consumer_request_events_request_idx on private.consumer_request_events (request_id, created_at);

alter table private.consumer_requests enable row level security;
alter table private.consumer_request_events enable row level security;

revoke all on private.consumer_requests, private.consumer_request_events from public, anon, authenticated;
revoke all on sequence private.consumer_request_reference_seq from public, anon, authenticated;

create or replace function public.submit_consumer_request(
  p_request_type text,
  p_first_name text,
  p_last_name text,
  p_contact text,
  p_preferred_channel text,
  p_order_reference text default null,
  p_approximate_date text default null,
  p_product text default null,
  p_reason text default null,
  p_privacy_right text default null,
  p_fingerprint_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_reference text;
  v_contact_hash text;
  v_date date;
begin
  p_request_type := btrim(coalesce(p_request_type, ''));
  p_first_name := btrim(coalesce(p_first_name, ''));
  p_last_name := btrim(coalesce(p_last_name, ''));
  p_contact := btrim(coalesce(p_contact, ''));
  p_preferred_channel := btrim(coalesce(p_preferred_channel, ''));
  p_order_reference := nullif(btrim(coalesce(p_order_reference, '')), '');
  p_product := nullif(btrim(coalesce(p_product, '')), '');
  p_reason := nullif(btrim(coalesce(p_reason, '')), '');
  p_privacy_right := nullif(btrim(coalesce(p_privacy_right, '')), '');
  p_fingerprint_hash := lower(btrim(coalesce(p_fingerprint_hash, '')));

  if p_request_type not in ('withdrawal', 'privacy')
     or char_length(p_first_name) not between 1 and 80
     or char_length(p_last_name) not between 1 and 80
     or char_length(p_contact) not between 3 and 160
     or p_preferred_channel not in ('email', 'whatsapp', 'phone')
     or p_fingerprint_hash !~ '^[a-f0-9]{64}$'
     or char_length(coalesce(p_order_reference, '')) > 80
     or char_length(coalesce(p_product, '')) > 200
     or char_length(coalesce(p_reason, '')) > 1000
  then
    raise exception 'invalid_request' using errcode = '22023';
  end if;

  if p_request_type = 'withdrawal' and p_product is null then
    raise exception 'invalid_request' using errcode = '22023';
  end if;
  if p_request_type = 'privacy' and (p_privacy_right is null or p_privacy_right not in ('access', 'rectification', 'deletion', 'information', 'consent') or p_reason is null) then
    raise exception 'invalid_request' using errcode = '22023';
  end if;
  if p_request_type = 'withdrawal' then p_privacy_right := null; end if;

  if nullif(btrim(coalesce(p_approximate_date, '')), '') is not null then
    begin v_date := p_approximate_date::date;
    exception when others then raise exception 'invalid_request' using errcode = '22023'; end;
  end if;

  v_contact_hash := encode(extensions.digest(lower(p_contact), 'sha256'), 'hex');
  if (select count(*) from private.consumer_requests where fingerprint_hash = p_fingerprint_hash and created_at > now() - interval '15 minutes') >= 5
     or (select count(*) from private.consumer_requests where contact_hash = v_contact_hash and created_at > now() - interval '60 minutes') >= 3
  then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  v_reference := format('CH-%s-%s', to_char(now(), 'YYYY'), lpad(nextval('private.consumer_request_reference_seq')::text, 8, '0'));
  insert into private.consumer_requests (
    public_reference, request_type, first_name, last_name, contact, contact_hash,
    preferred_channel, order_reference, approximate_date, product, reason,
    privacy_right, fingerprint_hash
  ) values (
    v_reference, p_request_type, p_first_name, p_last_name, p_contact, v_contact_hash,
    p_preferred_channel, p_order_reference, v_date, p_product, p_reason,
    p_privacy_right, p_fingerprint_hash
  ) returning id into v_id;

  insert into private.consumer_request_events (request_id, event_type, to_status)
  values (v_id, 'received', 'received');
  return jsonb_build_object('reference', v_reference);
end;
$$;

revoke all on function public.submit_consumer_request(text,text,text,text,text,text,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.submit_consumer_request(text,text,text,text,text,text,text,text,text,text,text) to anon, authenticated;

create or replace function public.get_consumer_requests_admin(p_limit integer default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(r) - 'contact_hash' - 'fingerprint_hash' order by r.created_at desc)
    from (select * from private.consumer_requests order by created_at desc limit least(greatest(coalesce(p_limit,100),1),500)) r
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.get_consumer_requests_admin(integer) from public, anon, authenticated;
grant execute on function public.get_consumer_requests_admin(integer) to authenticated;

create or replace function public.update_consumer_request_status_admin(
  p_request_id uuid,
  p_status text,
  p_note text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_previous text;
begin
  if auth.uid() is null or not private.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status not in ('received','in_review','responded','resolved','rejected_with_reason') then raise exception 'invalid_status' using errcode = '22023'; end if;
  if p_status = 'rejected_with_reason' and nullif(btrim(coalesce(p_note,'')), '') is null then raise exception 'rejection_reason_required' using errcode = '22023'; end if;
  select status into v_previous from private.consumer_requests where id = p_request_id for update;
  if v_previous is null then return false; end if;
  update private.consumer_requests
  set status = p_status,
      rejection_reason = case when p_status = 'rejected_with_reason' then left(btrim(p_note),1000) else rejection_reason end,
      responded_at = case when p_status = 'responded' then coalesce(responded_at,now()) else responded_at end,
      resolved_at = case when p_status = 'resolved' then coalesce(resolved_at,now()) else resolved_at end,
      updated_at = now()
  where id = p_request_id;
  insert into private.consumer_request_events (request_id,event_type,from_status,to_status,actor_user_id,note)
  values (p_request_id,'status_changed',v_previous,p_status,auth.uid(),left(nullif(btrim(coalesce(p_note,'')),''),1000));
  return true;
end;
$$;

revoke all on function public.update_consumer_request_status_admin(uuid,text,text) from public, anon, authenticated;
grant execute on function public.update_consumer_request_status_admin(uuid,text,text) to authenticated;

comment on table private.consumer_requests is 'Consumer withdrawal and privacy requests. Not exposed through the Data API.';
comment on function public.submit_consumer_request(text,text,text,text,text,text,text,text,text,text,text)
  is 'Validated anonymous intake with database rate limiting. Returns only a public receipt reference.';
