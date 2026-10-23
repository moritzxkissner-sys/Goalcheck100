begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('offer-pdfs', 'offer-pdfs', false, 10485760, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  customer_name text not null check (char_length(customer_name) between 1 and 120),
  starts_at timestamptz not null check (starts_at >= timestamptz '2000-01-01' and starts_at < timestamptz '2100-01-01'),
  notes text not null default '' check (char_length(notes) <= 1000),
  hubspot_contact_id text check (char_length(hubspot_contact_id) between 1 and 120),
  superchat_contact_id text check (char_length(superchat_contact_id) between 1 and 120),
  pdf_name text check (char_length(pdf_name) between 1 and 180),
  pdf_size integer check (pdf_size between 1 and 10485760),
  pdf_path text unique,
  status text not null default 'draft' check (status in ('draft','ready','pending_connection','sent','failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint offer_pdf_fields_together check ((pdf_name is null and pdf_size is null and pdf_path is null) or (pdf_name is not null and pdf_size is not null and pdf_path is not null)),
  constraint offer_pdf_path_owner check (pdf_path is null or pdf_path ~ ('^' || owner_id::text || '/' || id::text || '/[0-9a-f-]{36}\.pdf$'))
);
create index offers_owner_calendar_idx on public.offers(owner_id, starts_at, id);
alter table public.offers add constraint offers_id_owner_unique unique(id, owner_id);
alter table public.offers enable row level security;
alter table public.offers force row level security;
create policy offers_owner_read on public.offers for select to authenticated using (owner_id = (select auth.uid()) and (select public.is_team_member()));
create policy offers_owner_insert on public.offers for insert to authenticated with check (owner_id = (select auth.uid()) and (select public.is_team_member()) and status = 'draft' and pdf_path is null);
create policy offers_owner_update on public.offers for update to authenticated using (owner_id = (select auth.uid()) and (select public.is_team_member()) and status in ('draft','ready')) with check (owner_id = (select auth.uid()) and (select public.is_team_member()) and status in ('draft','ready'));
create policy offers_owner_delete on public.offers for delete to authenticated using (owner_id = (select auth.uid()) and (select public.is_team_member()) and status in ('draft','ready'));
revoke all on public.offers from public, anon, authenticated;
grant select, insert, update, delete on public.offers to authenticated;
grant all on public.offers to service_role;

create table public.offer_appointments (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null,
  owner_id uuid not null,
  title text not null check (char_length(title) between 1 and 120),
  starts_at timestamptz not null check (starts_at >= timestamptz '2000-01-01' and starts_at < timestamptz '2100-01-01'),
  ends_at timestamptz check (ends_at >= starts_at and ends_at < timestamptz '2100-01-01'),
  notes text not null default '' check (char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint offer_appointments_owner_fk foreign key (offer_id, owner_id) references public.offers(id, owner_id) on delete cascade
);
create index offer_appointments_calendar_idx on public.offer_appointments(owner_id, starts_at, id);
alter table public.offer_appointments enable row level security;
alter table public.offer_appointments force row level security;
create policy offer_appointments_owner_read on public.offer_appointments for select to authenticated using (owner_id = (select auth.uid()) and (select public.is_team_member()));
create policy offer_appointments_owner_insert on public.offer_appointments for insert to authenticated with check (owner_id = (select auth.uid()) and (select public.is_team_member()));
create policy offer_appointments_owner_update on public.offer_appointments for update to authenticated using (owner_id = (select auth.uid()) and (select public.is_team_member())) with check (owner_id = (select auth.uid()) and (select public.is_team_member()));
create policy offer_appointments_owner_delete on public.offer_appointments for delete to authenticated using (owner_id = (select auth.uid()) and (select public.is_team_member()));
revoke all on public.offer_appointments from public, anon, authenticated;
grant select, insert, update, delete on public.offer_appointments to authenticated;
grant all on public.offer_appointments to service_role;

create table public.offer_dispatch_events (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null check (event_type in ('dispatch_requested','delivery_confirmed','delivery_failed')),
  state text not null check (state in ('pending_connection','sent','failed')),
  pdf_path text not null,
  hubspot_contact_id text,
  superchat_contact_id text,
  created_at timestamptz not null default now(),
  constraint dispatch_has_contact check (hubspot_contact_id is not null or superchat_contact_id is not null)
);
create index offer_dispatch_events_offer_idx on public.offer_dispatch_events(offer_id, created_at desc);
alter table public.offer_dispatch_events enable row level security;
alter table public.offer_dispatch_events force row level security;
create policy offer_dispatch_owner_read on public.offer_dispatch_events for select to authenticated using (owner_id = (select auth.uid()) and (select public.is_team_member()));
revoke all on public.offer_dispatch_events from public, anon, authenticated;
grant select on public.offer_dispatch_events to authenticated;
grant all on public.offer_dispatch_events to service_role;

create function public.request_offer_dispatch(selected_offer uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare offer_row public.offers%rowtype; event_id uuid;
begin
  if not public.is_team_member() then raise exception 'Active team membership required' using errcode = '42501'; end if;
  select * into offer_row from public.offers where id = selected_offer and owner_id = (select auth.uid()) for update;
  if not found then raise exception 'Offer not found' using errcode = 'P0002'; end if;
  if offer_row.status not in ('draft','ready') then raise exception 'Offer already requested' using errcode = '22023'; end if;
  if offer_row.pdf_path is null or (offer_row.hubspot_contact_id is null and offer_row.superchat_contact_id is null) then
    raise exception 'PDF and a contact ID required' using errcode = '22023';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'offer-pdfs' and name = offer_row.pdf_path) then
    raise exception 'PDF file missing' using errcode = '22023';
  end if;
  insert into public.offer_dispatch_events(offer_id, owner_id, event_type, state, pdf_path, hubspot_contact_id, superchat_contact_id)
  values (offer_row.id, offer_row.owner_id, 'dispatch_requested', 'pending_connection', offer_row.pdf_path, offer_row.hubspot_contact_id, offer_row.superchat_contact_id)
  returning id into event_id;
  update public.offers set status = 'pending_connection', updated_at = now() where id = offer_row.id;
  return event_id;
end;
$$;
revoke all on function public.request_offer_dispatch(uuid) from public, anon, authenticated;
grant execute on function public.request_offer_dispatch(uuid) to authenticated;

create policy offer_pdf_owner_read on storage.objects for select to authenticated
  using (bucket_id = 'offer-pdfs' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.is_team_member()));
create policy offer_pdf_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'offer-pdfs' and (storage.foldername(name))[1] = (select auth.uid())::text and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.pdf$' and (select public.is_team_member()));
create policy offer_pdf_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'offer-pdfs' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.is_team_member())
    and not exists (select 1 from public.offer_dispatch_events e where e.pdf_path = name and e.state = 'pending_connection'));

commit;
