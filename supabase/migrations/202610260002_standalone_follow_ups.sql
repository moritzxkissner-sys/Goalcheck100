begin;

create table public.follow_up_tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  assigned_to uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  customer_name text not null check (char_length(customer_name) between 1 and 120),
  customer_email text check (customer_email is null or char_length(customer_email) <= 254),
  customer_phone text check (customer_phone is null or customer_phone ~ '^\+[1-9][0-9]{6,14}$'),
  offer_subject text not null check (char_length(offer_subject) between 1 and 180),
  start_time timestamptz not null,
  end_time timestamptz not null,
  status text not null default 'pending' check (status in ('pending','completed','rescheduled')),
  notes text not null default '' check (char_length(notes) <= 1000),
  source_appointment_id uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint follow_up_time_order check (end_time > start_time and end_time <= start_time + interval '24 hours'),
  constraint follow_up_owner_assignee check (assigned_to = owner_id)
);
create index follow_up_tasks_calendar_idx on public.follow_up_tasks(owner_id, start_time, id);
alter table public.follow_up_tasks enable row level security;
alter table public.follow_up_tasks force row level security;
create policy follow_up_owner_read on public.follow_up_tasks for select to authenticated using (owner_id = (select auth.uid()) and (select public.is_team_member()));
create policy follow_up_owner_insert on public.follow_up_tasks for insert to authenticated with check (owner_id = (select auth.uid()) and assigned_to = (select auth.uid()) and (select public.is_team_member()));
create policy follow_up_owner_update on public.follow_up_tasks for update to authenticated using (owner_id = (select auth.uid()) and (select public.is_team_member())) with check (owner_id = (select auth.uid()) and assigned_to = (select auth.uid()) and (select public.is_team_member()));
create policy follow_up_owner_delete on public.follow_up_tasks for delete to authenticated using (owner_id = (select auth.uid()) and (select public.is_team_member()));
revoke all on public.follow_up_tasks from public, anon, authenticated;
grant select, insert, update, delete on public.follow_up_tasks to authenticated;
grant all on public.follow_up_tasks to service_role;

-- Preserve previously linked follow-up appointments as standalone entries.
insert into public.follow_up_tasks (owner_id, assigned_to, title, customer_name, customer_email, customer_phone, offer_subject, start_time, end_time, status, notes, source_appointment_id, created_at, updated_at)
select a.owner_id, a.owner_id, a.title, o.customer_name, o.recipient_email, o.recipient_phone,
  o.title, a.starts_at, coalesce(a.ends_at, a.starts_at + interval '30 minutes'), a.status,
  trim(concat_ws(E'\n', nullif(a.notes, ''), nullif(a.remind_note, ''))), a.id, a.created_at, a.updated_at
from public.offer_appointments a join public.offers o on o.id = a.offer_id and o.owner_id = a.owner_id
on conflict (source_appointment_id) do nothing;

commit;

