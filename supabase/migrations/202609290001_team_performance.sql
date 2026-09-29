-- Run once AFTER 202609280001_goal_track.sql; do not rerun the initial schema.
begin;

-- Retain historical categories and amounts verbatim. NOT VALID skips checking
-- old rows but still enforces the new seven-category list on every new write.
alter table public.sales_entries drop constraint sales_entries_category_check;
alter table public.sales_entries add constraint sales_entries_category_check
  check (category in ('Rechtsschutz','Haftpflicht','Hausrat','Wohngebäude','Unfall','Krankenversicherung','Sonstiges')) not valid;

-- NULL explicitly means "not recorded" for pre-migration records. Never infer
-- historical contract types. Older clients omit this column; during rollout
-- their new entries get Neuvertrag, the new form's default.
alter table public.sales_entries add column transaction_type text;
alter table public.sales_entries alter column transaction_type set default 'Neuvertrag';
alter table public.sales_entries add constraint sales_entries_transaction_type_check
  check (transaction_type in ('Neuvertrag','Vertragsumstellung'));
alter table public.sales_entries add constraint sales_entries_transaction_type_required
  check (transaction_type is not null) not valid;

-- Independent of the selected dashboard month. Date is calculated by Postgres
-- on each request in Europe/Berlin (including DST); no scheduled reset needed.
-- Expose only aggregates, with the same membership gate as the monthly RPC.
create function public.team_daily_leaderboard()
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
    where p.active
    order by coalesce(s.total, 0) desc, p.full_name, p.id;
end;
$$;
revoke all on function public.team_daily_leaderboard() from public, anon, authenticated;
grant execute on function public.team_daily_leaderboard() to authenticated;
commit;
