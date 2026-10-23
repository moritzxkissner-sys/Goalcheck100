begin;

alter table public.offers
  add column recipient_email text check (recipient_email is null or (char_length(recipient_email) between 3 and 254 and recipient_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')),
  add column recipient_phone text check (recipient_phone is null or recipient_phone ~ '^\+[1-9][0-9]{6,14}$');

create table public.offer_deliveries (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null,
  owner_id uuid not null,
  channel text not null check (channel in ('email', 'superchat')),
  recipient text not null check (char_length(recipient) between 3 and 254),
  state text not null default 'queued' check (state in ('queued', 'sending', 'sent', 'delivered', 'read', 'failed', 'unknown')),
  attempt_count integer not null default 1 check (attempt_count > 0),
  current_attempt_id uuid not null,
  provider_message_id text,
  last_error text check (last_error is null or char_length(last_error) <= 1000),
  requested_at timestamptz not null default now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint offer_deliveries_offer_owner_fk foreign key (offer_id, owner_id)
    references public.offers(id, owner_id) on delete cascade,
  constraint offer_deliveries_offer_channel_unique unique (offer_id, channel),
  constraint offer_deliveries_id_owner_unique unique (id, owner_id)
);
create index offer_deliveries_owner_offer_idx on public.offer_deliveries(owner_id, offer_id);
create index offer_deliveries_provider_message_idx on public.offer_deliveries(channel, provider_message_id)
  where provider_message_id is not null;
alter table public.offer_deliveries enable row level security;
alter table public.offer_deliveries force row level security;
create policy offer_deliveries_owner_read on public.offer_deliveries for select to authenticated
  using (owner_id = (select auth.uid()) and (select public.is_team_member()));
revoke all on public.offer_deliveries from public, anon, authenticated;
grant select on public.offer_deliveries to authenticated;
grant all on public.offer_deliveries to service_role;
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'offer_deliveries'
    ) then
    alter publication supabase_realtime add table public.offer_deliveries;
  end if;
end;
$$;

create table public.offer_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null,
  owner_id uuid not null,
  attempt_number integer not null check (attempt_number > 0),
  idempotency_key uuid not null default gen_random_uuid() unique,
  state text not null default 'queued' check (state in ('queued', 'sending', 'sent', 'delivered', 'read', 'failed', 'unknown')),
  provider_message_id text,
  error text check (error is null or char_length(error) <= 1000),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint offer_delivery_attempts_delivery_owner_fk foreign key (delivery_id, owner_id)
    references public.offer_deliveries(id, owner_id) on delete cascade,
  constraint offer_delivery_attempts_sequence_unique unique (delivery_id, attempt_number),
  constraint offer_delivery_attempts_id_owner_unique unique (id, owner_id)
);
create index offer_delivery_attempts_message_idx on public.offer_delivery_attempts(provider_message_id)
  where provider_message_id is not null;
alter table public.offer_delivery_attempts enable row level security;
alter table public.offer_delivery_attempts force row level security;
create policy offer_delivery_attempts_owner_read on public.offer_delivery_attempts for select to authenticated
  using (owner_id = (select auth.uid()) and (select public.is_team_member()));
revoke all on public.offer_delivery_attempts from public, anon, authenticated;
grant select on public.offer_delivery_attempts to authenticated;
grant all on public.offer_delivery_attempts to service_role;

create table public.offer_delivery_events (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null,
  owner_id uuid not null,
  provider_event_id text not null check (char_length(provider_event_id) between 1 and 255),
  state text not null check (state in ('sending', 'sent', 'delivered', 'read', 'failed', 'unknown')),
  provider_message_id text,
  failure_reason text check (failure_reason is null or char_length(failure_reason) <= 1000),
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  constraint offer_delivery_events_attempt_owner_fk foreign key (attempt_id, owner_id)
    references public.offer_delivery_attempts(id, owner_id) on delete cascade,
  constraint offer_delivery_events_provider_unique unique (attempt_id, provider_event_id)
);
create index offer_delivery_events_attempt_idx on public.offer_delivery_events(attempt_id, occurred_at desc);
alter table public.offer_delivery_events enable row level security;
alter table public.offer_delivery_events force row level security;
create policy offer_delivery_events_owner_read on public.offer_delivery_events for select to authenticated
  using (owner_id = (select auth.uid()) and (select public.is_team_member()));
revoke all on public.offer_delivery_events from public, anon, authenticated;
grant select on public.offer_delivery_events to authenticated;
grant all on public.offer_delivery_events to service_role;

-- The older one-argument function must be removed to avoid ambiguous RPC resolution.
drop function public.request_offer_dispatch(uuid);
create function public.request_offer_dispatch(
  selected_offer uuid, selected_owner uuid, selected_channel text default null,
  selected_pdf_path text default null, selected_updated_at timestamptz default null,
  selected_recipient_email text default null, selected_recipient_phone text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  offer_row public.offers%rowtype;
  delivery_row public.offer_deliveries%rowtype;
  attempt_row public.offer_delivery_attempts%rowtype;
  target_channel text;
  target_recipient text;
  result_attempts jsonb := '[]'::jsonb;
begin
  if selected_owner is null or not exists
    (select 1 from public.profiles where id = selected_owner and active) then
    raise exception 'Active team membership required' using errcode = '42501';
  end if;
  select * into offer_row from public.offers
    where id = selected_offer and owner_id = selected_owner for update;
  if not found then raise exception 'Offer not found' using errcode = 'P0002'; end if;
  if selected_pdf_path is not null and offer_row.pdf_path is distinct from selected_pdf_path then
    raise exception 'Offer PDF changed during dispatch' using errcode = '22023';
  end if;
  if selected_updated_at is not null and offer_row.updated_at is distinct from selected_updated_at then
    raise exception 'Offer changed during dispatch' using errcode = '22023';
  end if;
  if (selected_recipient_email is not null and offer_row.recipient_email is distinct from selected_recipient_email)
    or (selected_recipient_phone is not null and offer_row.recipient_phone is distinct from selected_recipient_phone) then
    raise exception 'Offer recipient changed during dispatch' using errcode = '22023';
  end if;
  if selected_channel is null then
    if offer_row.status not in ('draft', 'ready') or exists
      (select 1 from public.offer_deliveries where offer_id = selected_offer) then
      raise exception 'Offer already requested' using errcode = '22023';
    end if;
  elsif selected_channel not in ('email', 'superchat') then
    raise exception 'Invalid channel' using errcode = '22023';
  end if;
  if offer_row.pdf_path is null or offer_row.recipient_email is null or offer_row.recipient_phone is null then
    raise exception 'PDF and both recipients required' using errcode = '22023';
  end if;
  if offer_row.pdf_size > 2900000 then
    raise exception 'PDF exceeds the automatic dispatch limit' using errcode = '22023';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'offer-pdfs' and name = offer_row.pdf_path) then
    raise exception 'PDF file missing' using errcode = '22023';
  end if;

  foreach target_channel in array (case when selected_channel is null
    then array['email', 'superchat'] else array[selected_channel] end) loop
    target_recipient := case when target_channel = 'email'
      then offer_row.recipient_email else offer_row.recipient_phone end;
    if selected_channel is null then
      insert into public.offer_deliveries
        (offer_id, owner_id, channel, recipient, current_attempt_id)
      values (offer_row.id, offer_row.owner_id, target_channel, target_recipient, gen_random_uuid())
      returning * into delivery_row;
    else
      select * into delivery_row from public.offer_deliveries
        where offer_id = selected_offer and channel = target_channel for update;
      if not found or delivery_row.state <> 'failed' then
        raise exception 'Only a failed channel may be retried' using errcode = '22023';
      end if;
      update public.offer_deliveries set
        state = 'queued', recipient = target_recipient,
        attempt_count = attempt_count + 1, current_attempt_id = gen_random_uuid(),
        provider_message_id = null, last_error = null, requested_at = now(),
        sent_at = null, delivered_at = null, read_at = null, failed_at = null,
        updated_at = now()
      where id = delivery_row.id returning * into delivery_row;
    end if;
    insert into public.offer_delivery_attempts
      (id, delivery_id, owner_id, attempt_number)
    values (delivery_row.current_attempt_id, delivery_row.id, offer_row.owner_id, delivery_row.attempt_count)
    returning * into attempt_row;
    result_attempts := result_attempts || jsonb_build_array(jsonb_build_object(
      'attempt_id', attempt_row.id,
      'delivery_id', delivery_row.id,
      'channel', target_channel,
      'recipient', target_recipient,
      'pdf_path', offer_row.pdf_path,
      'idempotency_key', attempt_row.idempotency_key
    ));
  end loop;
  insert into public.offer_dispatch_events
    (offer_id, owner_id, event_type, state, pdf_path, hubspot_contact_id, superchat_contact_id)
  values (offer_row.id, offer_row.owner_id, 'dispatch_requested', 'pending_connection',
    offer_row.pdf_path, offer_row.hubspot_contact_id, coalesce(offer_row.superchat_contact_id, offer_row.recipient_phone));
  update public.offers set status = 'pending_connection', updated_at = now() where id = offer_row.id;
  return jsonb_build_object('offer_id', selected_offer, 'attempts', result_attempts);
end;
$$;
revoke all on function public.request_offer_dispatch(uuid, uuid, text, text, timestamptz, text, text)
  from public, anon, authenticated;
grant execute on function public.request_offer_dispatch(uuid, uuid, text, text, timestamptz, text, text) to service_role;

create function public.record_offer_delivery_event(
  selected_attempt uuid, provider_event_id text, next_state text,
  new_provider_message_id text default null, new_failure_reason text default null,
  event_occurred_at timestamptz default now()
) returns boolean language plpgsql security definer set search_path = '' as $$
declare
  attempt_row public.offer_delivery_attempts%rowtype;
  delivery_row public.offer_deliveries%rowtype;
  target_offer uuid;
  aggregate_status text;
begin
  if provider_event_id is null or char_length(provider_event_id) not between 1 and 255
    or next_state not in ('sending', 'sent', 'delivered', 'read', 'failed', 'unknown')
    or (new_failure_reason is not null and char_length(new_failure_reason) > 1000)
    or (next_state = 'failed' and nullif(new_failure_reason, '') is null)
    or event_occurred_at is null then
    raise exception 'Invalid delivery event' using errcode = '22023';
  end if;
  select d.offer_id into target_offer
    from public.offer_delivery_attempts a
    join public.offer_deliveries d on d.id = a.delivery_id
    where a.id = selected_attempt;
  if not found then raise exception 'Attempt not found' using errcode = 'P0002'; end if;
  perform 1 from public.offers where id = target_offer for update;
  select * into delivery_row from public.offer_deliveries
    where id = (select delivery_id from public.offer_delivery_attempts where id = selected_attempt)
    for update;
  select * into attempt_row from public.offer_delivery_attempts
    where id = selected_attempt for update;
  insert into public.offer_delivery_events
    (attempt_id, owner_id, provider_event_id, state, provider_message_id, failure_reason, occurred_at)
  values (attempt_row.id, attempt_row.owner_id, provider_event_id, next_state,
    new_provider_message_id, new_failure_reason, event_occurred_at)
  on conflict on constraint offer_delivery_events_provider_unique do nothing;
  if not found then return false; end if;
  if delivery_row.current_attempt_id <> attempt_row.id then return false; end if;
  if not (
    (attempt_row.state = 'queued' and next_state in ('sending', 'failed', 'unknown')) or
    (attempt_row.state = 'sending' and next_state in ('sent', 'delivered', 'read', 'failed', 'unknown')) or
    (attempt_row.state = 'unknown' and next_state in ('sent', 'delivered', 'read', 'failed')) or
    (attempt_row.state = 'sent' and next_state in ('delivered', 'read', 'failed')) or
    (attempt_row.state = 'delivered' and next_state = 'read')
  ) then return false; end if;
  update public.offer_delivery_attempts set
    state = next_state,
    provider_message_id = coalesce(new_provider_message_id, offer_delivery_attempts.provider_message_id),
    error = case when next_state = 'failed' then new_failure_reason else null end,
    finished_at = case when next_state in ('read', 'failed') then event_occurred_at else finished_at end,
    updated_at = now()
  where id = attempt_row.id;
  update public.offer_deliveries set
    state = next_state,
    provider_message_id = coalesce(new_provider_message_id, offer_deliveries.provider_message_id),
    last_error = case when next_state = 'failed' then new_failure_reason else null end,
    sent_at = case when next_state in ('sent', 'delivered', 'read') then coalesce(sent_at, event_occurred_at) else sent_at end,
    delivered_at = case when next_state in ('delivered', 'read') then coalesce(delivered_at, event_occurred_at) else delivered_at end,
    read_at = case when next_state = 'read' then event_occurred_at else read_at end,
    failed_at = case when next_state = 'failed' then event_occurred_at else failed_at end,
    updated_at = now()
  where id = delivery_row.id;
  select case
    when bool_and(state in ('sent', 'delivered', 'read')) then 'sent'
    when bool_or(state = 'failed') then 'failed'
    else 'pending_connection'
  end into aggregate_status from public.offer_deliveries where offer_id = delivery_row.offer_id;
  update public.offers set status = aggregate_status, updated_at = now()
    where id = delivery_row.offer_id;
  return true;
end;
$$;
revoke all on function public.record_offer_delivery_event(uuid, text, text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.record_offer_delivery_event(uuid, text, text, text, text, timestamptz)
  to service_role;

drop policy offer_pdf_owner_delete on storage.objects;
create policy offer_pdf_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'offer-pdfs'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.is_team_member())
    and not exists (select 1 from public.offer_deliveries d
      join public.offers o on o.id = d.offer_id where o.pdf_path = name));

commit;
