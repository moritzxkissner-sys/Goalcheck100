-- Goal Track: one invitation-only insurance sales team.
-- Apply once using the Supabase SQL Editor or `supabase db push`.
begin;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 1 and 100),
  active boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.monthly_goals (
  user_id uuid not null references public.profiles(id) on delete cascade,
  month date not null check (extract(day from month) = 1 and month between date '2000-01-01' and date '2099-12-01'),
  target numeric(12,2) not null check (target > 0 and target <= 999999999),
  primary key (user_id, month)
);
create table public.sales_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0 and amount <= 999999999),
  category text not null check (category in ('Rechtsschutz','Kfz','Haftpflicht','Hausrat','Wohngebäude','Unfall','Krankenversicherung','Sonstiges')),
  occurred_on date not null check (occurred_on >= date '2000-01-01' and occurred_on <= (now() at time zone 'Europe/Berlin')::date),
  note text not null default '' check (char_length(note) <= 160),
  created_at timestamptz not null default now()
);
create index sales_entries_user_month_idx on public.sales_entries(user_id, occurred_on);
create index sales_entries_month_idx on public.sales_entries(occurred_on);

create function public.create_partner_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, full_name) values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), nullif(split_part(new.email, '@', 1), ''), 'Vertriebspartner'), 100)
  );
  return new;
end;
$$;
create trigger on_goal_track_user_created after insert on auth.users for each row execute function public.create_partner_profile();

-- Support accounts that existed before installing this migration. All start inactive.
insert into public.profiles(id, full_name)
select id, left(coalesce(nullif(trim(raw_user_meta_data ->> 'full_name'), ''), nullif(split_part(email, '@', 1), ''), 'Vertriebspartner'), 100)
from auth.users on conflict (id) do nothing;

-- Membership can only be enabled by the operator, never via user metadata or API writes.
create function public.is_team_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id = (select auth.uid()) and active);
$$;

alter table public.profiles enable row level security;
alter table public.monthly_goals enable row level security;
alter table public.sales_entries enable row level security;
create policy own_profile on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy own_goal_read on public.monthly_goals for select to authenticated using (user_id = (select auth.uid()) and (select public.is_team_member()));
create policy own_goal_insert on public.monthly_goals for insert to authenticated with check (user_id = (select auth.uid()) and (select public.is_team_member()));
create policy own_goal_update on public.monthly_goals for update to authenticated using (user_id = (select auth.uid()) and (select public.is_team_member())) with check (user_id = (select auth.uid()) and (select public.is_team_member()));
create policy own_entries_read on public.sales_entries for select to authenticated using (user_id = (select auth.uid()) and (select public.is_team_member()));
create policy own_entries_insert on public.sales_entries for insert to authenticated with check (user_id = (select auth.uid()) and (select public.is_team_member()));
create policy own_entries_delete on public.sales_entries for delete to authenticated using (user_id = (select auth.uid()) and (select public.is_team_member()));

-- Deliberate, narrow aggregate API: never expose another partner's notes or categories.
-- SECURITY DEFINER is needed to aggregate records hidden by individual-entry RLS.
create function public.team_leaderboard(selected_month date)
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
    where p.active
    order by coalesce(s.total, 0) desc, p.full_name;
end;
$$;

revoke all on public.profiles, public.monthly_goals, public.sales_entries from anon, authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update on public.monthly_goals to authenticated;
grant select, insert, delete on public.sales_entries to authenticated;
revoke all on function public.create_partner_profile() from public, anon, authenticated;
revoke all on function public.is_team_member() from public, anon, authenticated;
revoke all on function public.team_leaderboard(date) from public, anon, authenticated;
grant execute on function public.is_team_member() to authenticated;
grant execute on function public.team_leaderboard(date) to authenticated;
grant all on public.profiles, public.monthly_goals, public.sales_entries to service_role;
commit;
