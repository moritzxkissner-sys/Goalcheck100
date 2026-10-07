-- Keep customer names private to their author and hide the named profile from
-- both team rankings without deleting its account or historical sales.
begin;

alter table public.sales_entries
  add column customer_name text not null default ''
  check (char_length(customer_name) <= 120);

alter table public.profiles
  add column visible_in_team boolean not null default true;

do $$
begin
  if (select count(*) from public.profiles
      where lower(btrim(full_name)) = lower('Moritz Kissner')) <> 1 then
    raise exception 'Expected exactly one Moritz Kissner profile';
  end if;
  update public.profiles
  set visible_in_team = false
  where lower(btrim(full_name)) = lower('Moritz Kissner');
end;
$$;

create or replace function public.team_leaderboard(selected_month date)
returns table(user_id uuid, full_name text, total numeric, target numeric, entry_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_team_member() then raise exception 'Active team membership required' using errcode = '42501'; end if;
  if selected_month is null or extract(day from selected_month) <> 1 or selected_month < date '2000-01-01' or selected_month > date '2099-12-01' then raise exception 'Invalid month'; end if;
  return query
    select p.id, p.full_name, coalesce(s.total, 0), coalesce(g.target, 10000), coalesce(s.entry_count, 0)
    from public.profiles p
    left join (
      select e.user_id, sum(e.amount) as total, count(*) as entry_count from public.sales_entries e
      where e.occurred_on >= selected_month and e.occurred_on < selected_month + interval '1 month'
      group by e.user_id
    ) s on s.user_id = p.id
    left join public.monthly_goals g on g.user_id = p.id and g.month = selected_month
    where p.active and p.visible_in_team
    order by coalesce(s.total, 0) desc, p.full_name;
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
    select p.id, p.full_name, coalesce(s.total, 0), today
    from public.profiles p
    left join (
      select e.user_id, sum(e.amount) as total
      from public.sales_entries e where e.occurred_on = today
      group by e.user_id
    ) s on s.user_id = p.id
    where p.active and p.visible_in_team
    order by coalesce(s.total, 0) desc, p.full_name, p.id;
end;
$$;

revoke all on function public.team_leaderboard(date) from public, anon, authenticated;
revoke all on function public.team_daily_leaderboard() from public, anon, authenticated;
grant execute on function public.team_leaderboard(date) to authenticated;
grant execute on function public.team_daily_leaderboard() to authenticated;

commit;
