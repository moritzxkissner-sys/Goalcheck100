-- Shared absence calendar for one active sales team. A person can only write
-- their own events; the filtered member list is deliberately separate from
-- the sales leaderboard's visibility setting.
begin;

create function public.is_calendar_member(subject_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = subject_id and p.active
      and lower(regexp_replace(btrim(p.full_name), '[[:space:]]+', ' ', 'g')) not in (
        'moritz kissner', 'alina dalga', 'alina dalgar',
        'lilli fischer', 'lilly fischer'
      )
  );
$$;

create table public.team_calendar_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  starts_on date not null check (starts_on between date '2000-01-01' and date '2099-12-31'),
  ends_on date not null check (ends_on between date '2000-01-01' and date '2099-12-31'),
  reason text not null check (reason in ('Urlaub', 'Krankheit', 'Homeoffice', 'Weiterbildung', 'Sonstiges')),
  comment text not null default '' check (char_length(comment) <= 500),
  created_at timestamptz not null default now(),
  constraint team_calendar_dates_in_order check (ends_on >= starts_on)
);

create index team_calendar_starts_on_idx on public.team_calendar_entries(starts_on, ends_on);
create index team_calendar_user_id_idx on public.team_calendar_entries(user_id);

alter table public.team_calendar_entries enable row level security;
alter table public.team_calendar_entries force row level security;

create policy team_calendar_read on public.team_calendar_entries for select to authenticated
  using ((select public.is_team_member()) and public.is_calendar_member(user_id));
create policy own_calendar_insert on public.team_calendar_entries for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_team_member()) and public.is_calendar_member(user_id));
create policy own_calendar_update on public.team_calendar_entries for update to authenticated
  using (user_id = (select auth.uid()) and (select public.is_team_member()) and public.is_calendar_member(user_id))
  with check (user_id = (select auth.uid()) and (select public.is_team_member()) and public.is_calendar_member(user_id));
create policy own_calendar_delete on public.team_calendar_entries for delete to authenticated
  using (user_id = (select auth.uid()) and (select public.is_team_member()) and public.is_calendar_member(user_id));

create function public.team_calendar_members()
returns table(id uuid, full_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_team_member() then
    raise exception 'Active team membership required' using errcode = '42501';
  end if;
  return query
    select p.id, p.full_name from public.profiles p
    where public.is_calendar_member(p.id)
    order by p.full_name, p.id;
end;
$$;

revoke all on public.team_calendar_entries from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.team_calendar_entries to authenticated;
revoke all on function public.is_calendar_member(uuid) from public, anon, authenticated;
grant execute on function public.is_calendar_member(uuid) to authenticated;
revoke all on function public.team_calendar_members() from public, anon, authenticated;
grant execute on function public.team_calendar_members() to authenticated;

commit;
