begin;
alter table public.sales_entries
 add column partner_id uuid references public.profiles(id),
 add column owner_percent integer not null default 100,
 add constraint valid_sale_split check ((partner_id is null and owner_percent=100) or (partner_id is not null and partner_id<>user_id and owner_percent between 1 and 99));
create index sales_entries_partner_month_idx on public.sales_entries(partner_id,occurred_on) where partner_id is not null;
create function public.validate_sale_partner() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.partner_id is not null and (TG_OP='INSERT' or new.partner_id is distinct from old.partner_id) and not exists(select 1 from public.profiles where id=new.partner_id and active) then raise exception 'Bitte einen aktiven Vertriebspartner auswählen'; end if;
 return new;
end; $$;
create trigger validate_sale_partner before insert or update on public.sales_entries for each row execute function public.validate_sale_partner();
revoke all on function public.validate_sale_partner() from public,anon,authenticated;
drop policy own_entries_read on public.sales_entries;
create policy participant_entries_read on public.sales_entries for select to authenticated using ((user_id=(select auth.uid()) or partner_id=(select auth.uid())) and (select public.is_team_member()));
create policy own_entries_update on public.sales_entries for update to authenticated using (user_id=(select auth.uid()) and (select public.is_team_member())) with check (user_id=(select auth.uid()) and (select public.is_team_member()));
grant update(amount,category,transaction_type,occurred_on,customer_name,partner_id,owner_percent) on public.sales_entries to authenticated;
-- One persisted contract, two cent-exact contributions, one contract count.
create view public.sale_contributions as
 select id,user_id,case when partner_id is null then amount else round(amount*owner_percent/100,2) end as amount,occurred_on,1::bigint as contract_count from public.sales_entries
 union all
 select id,partner_id,amount-round(amount*owner_percent/100,2),occurred_on,0::bigint from public.sales_entries where partner_id is not null;
revoke all on public.sale_contributions from public,anon,authenticated;
create function public.sale_partners() returns table(id uuid,full_name text)
language sql stable security definer set search_path='' as $$
 select p.id,p.full_name from public.profiles p where p.active and public.is_team_member() order by p.full_name,p.id;
$$;
revoke all on function public.sale_partners() from public,anon,authenticated;
grant execute on function public.sale_partners() to authenticated;
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
      select e.user_id, sum(e.amount) as total, sum(e.contract_count)::bigint as entry_count from public.sale_contributions e
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
      from public.sale_contributions e where e.occurred_on = today
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
