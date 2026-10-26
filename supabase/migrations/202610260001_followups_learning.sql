begin;

alter table public.offer_appointments
  add column due_date timestamptz,
  add column status text not null default 'pending' check (status in ('pending','completed','rescheduled')),
  add column assigned_to uuid references public.profiles(id),
  add column remind_note text not null default '' check (char_length(remind_note) <= 500);
update public.offer_appointments set due_date = starts_at, assigned_to = owner_id;
alter table public.offer_appointments
  alter column due_date set not null,
  alter column assigned_to set not null,
  add constraint offer_followup_due_matches_start check (due_date = starts_at),
  add constraint offer_followup_assignee_owner check (assigned_to = owner_id);
create index offer_followup_due_idx on public.offer_appointments(owner_id, status, due_date);

create table public.learning_progress (
  user_id uuid not null references public.profiles(id) on delete cascade,
  track_id text not null check (track_id ~ '^[a-z0-9-]{1,64}$'),
  completed_units integer not null default 0 check (completed_units between 0 and 100),
  total_units integer not null default 1 check (total_units between 1 and 100),
  updated_at timestamptz not null default now(),
  primary key (user_id, track_id),
  constraint learning_progress_bounds check (completed_units <= total_units)
);
alter table public.learning_progress enable row level security;
alter table public.learning_progress force row level security;
create policy learning_progress_select on public.learning_progress for select to authenticated using (user_id = (select auth.uid()) and (select public.is_team_member()));
create policy learning_progress_insert on public.learning_progress for insert to authenticated with check (user_id = (select auth.uid()) and (select public.is_team_member()));
create policy learning_progress_update on public.learning_progress for update to authenticated using (user_id = (select auth.uid()) and (select public.is_team_member())) with check (user_id = (select auth.uid()) and (select public.is_team_member()));
revoke all on public.learning_progress from public, anon, authenticated;
grant select, insert, update on public.learning_progress to authenticated;
grant all on public.learning_progress to service_role;

commit;

