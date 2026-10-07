-- Record cancellations in the month they are reported, independently of the
-- original sale. Keep historical sales immutable and subtract cancellations
-- only when calculating the reporting-day/month BWS totals.
begin;

create table public.cancellation_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0 and amount <= 999999999),
  occurred_on date not null check (occurred_on >= date '2000-01-01' and occurred_on <= (now() at time zone 'Europe/Berlin')::date),
  reason text not null default '' check (char_length(reason) <= 120),
  created_at timestamptz not null default now()
);
create index cancellation_entries_user_month_idx on public.cancellation_entries(user_id, occurred_on);
create index cancellation_entries_month_idx on public.cancellation_entries(occurred_on);

alter table public.cancellation_entries enable row level security;
create policy own_cancellations_read on public.cancellation_entries for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_team_member()));
create policy own_cancellations_insert on public.cancellation_entries for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_team_member()));
create policy own_cancellations_delete on public.cancellation_entries for delete to authenticated
  using (user_id = (select auth.uid()) and (select public.is_team_member()));

revoke all on public.cancellation_entries from anon, authenticated;
grant select, insert, delete on public.cancellation_entries to authenticated;
grant all on public.cancellation_entries to service_role;

-- Preserve the RPC response shape so existing team views continue to work.
-- Count contracts only; Storno is a deduction, never a new contract.
create or replace function public.team_leaderboard(selected_month date)
returns table(user_id uuid, full_name text, total numeric, target numeric, entry_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_team_member() then raise exception 'Active team membership required' using errcode = '42501'; end if;
  if selected_month is null or extract(day from selected_month) <> 1 or selected_month < date '2000-01-01' or selected_month > date '2099-12-01' then raise exception 'Invalid month'; end if;
  return query
    select p.id, p.full_name, coalesce(s.total, 0) - coalesce(c.total, 0),
      coalesce(g.target, 10000), coalesce(s.entry_count, 0)
    from public.profiles p
    left join (
      select e.user_id, sum(e.amount) as total, count(*) as entry_count from public.sales_entries e
      where e.occurred_on >= selected_month and e.occurred_on < selected_month + interval '1 month'
      group by e.user_id
    ) s on s.user_id = p.id
    left join (
      select e.user_id, sum(e.amount) as total from public.cancellation_entries e
      where e.occurred_on >= selected_month and e.occurred_on < selected_month + interval '1 month'
      group by e.user_id
    ) c on c.user_id = p.id
    left join public.monthly_goals g on g.user_id = p.id and g.month = selected_month
    where p.active and p.visible_in_team
    order by coalesce(s.total, 0) - coalesce(c.total, 0) desc, p.full_name;
end;
$$;

create or replace function public.team_daily_leaderboard()
returns table(user_id uuid, full_name text, total numeric, day date)
language plpgsql stable security definer set search_path = '' as $$
declare today date := (now() at time zone 'Europe/Berlin')::date;
begin
  if not public.is_team_member() then
    raise exception 'Active team membership required' using errcode = '42501';
  end if;
  return query
    select p.id, p.full_name, coalesce(s.total, 0) - coalesce(c.total, 0), today
    from public.profiles p
    left join (
      select e.user_id, sum(e.amount) as total
      from public.sales_entries e where e.occurred_on = today
      group by e.user_id
    ) s on s.user_id = p.id
    left join (
      select e.user_id, sum(e.amount) as total
      from public.cancellation_entries e where e.occurred_on = today
      group by e.user_id
    ) c on c.user_id = p.id
    where p.active and p.visible_in_team
    order by coalesce(s.total, 0) - coalesce(c.total, 0) desc, p.full_name, p.id;
end;
$$;

revoke all on function public.team_leaderboard(date) from public, anon, authenticated;
revoke all on function public.team_daily_leaderboard() from public, anon, authenticated;
grant execute on function public.team_leaderboard(date) to authenticated;
grant execute on function public.team_daily_leaderboard() to authenticated;

commit;
