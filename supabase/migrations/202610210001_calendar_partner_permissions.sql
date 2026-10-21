-- Calendar delegates are explicitly enabled by the database operator on
-- profiles.can_manage_team_calendar. The default grants nobody extra access.
begin;

alter table public.profiles
  add column can_manage_team_calendar boolean not null default false;

update public.profiles
set full_name = 'Yuliia Solianyk'
where lower(regexp_replace(btrim(full_name), '[[:space:]]+', ' ', 'g')) = 'julia soljanik';

update public.profiles
set full_name = 'Alina Dalga'
where lower(regexp_replace(btrim(full_name), '[[:space:]]+', ' ', 'g')) = 'alina dalgar';

create function public.can_manage_team_calendar() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.active
      and p.can_manage_team_calendar
  );
$$;
revoke all on function public.can_manage_team_calendar() from public, anon, authenticated;
grant execute on function public.can_manage_team_calendar() to authenticated;

create or replace function public.is_calendar_member(subject_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = subject_id and p.active
  );
$$;

drop function public.team_calendar_members();
create function public.team_calendar_members()
returns table(id uuid, full_name text, can_receive_entries boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_team_member() then
    raise exception 'Active team membership required' using errcode = '42501';
  end if;
  return query
    with active_members as (
      select p.id,
        case lower(regexp_replace(btrim(p.full_name), '[[:space:]]+', ' ', 'g'))
          when 'julia soljanik' then 'Yuliia Solianyk'::text
          when 'yuliia solianyk' then 'Yuliia Solianyk'::text
          when 'alina dalgar' then 'Alina Dalga'::text
          when 'alina dalga' then 'Alina Dalga'::text
          when 'lilly fischer' then 'Lilli Fischer'::text
          when 'lilli fischer' then 'Lilli Fischer'::text
          else p.full_name
        end as full_name,
        true as can_receive_entries
      from public.profiles p
      where p.active
    ),
    roster as (
      select a.id, a.full_name, a.can_receive_entries from active_members a
      union all
      select standby.id, standby.full_name, false
      from (values
        ('85f5c2d0-96a8-5db7-98a2-001020261014'::uuid, 'Yuliia Solianyk'::text),
        ('85f5c2d0-96a8-5db7-98a2-002020261014'::uuid, 'Lilli Fischer'::text),
        ('85f5c2d0-96a8-5db7-98a2-003020261014'::uuid, 'Moritz Kissner'::text),
        ('85f5c2d0-96a8-5db7-98a2-004020261014'::uuid, 'Alina Dalga'::text)
      ) as standby(id, full_name)
      where not exists (
        select 1 from active_members a where a.full_name = standby.full_name
      )
    )
    select r.id, r.full_name, r.can_receive_entries
    from roster r order by r.full_name, r.id;
end;
$$;
revoke all on function public.team_calendar_members() from public, anon, authenticated;
grant execute on function public.team_calendar_members() to authenticated;

create policy delegate_calendar_insert on public.team_calendar_entries
for insert to authenticated
with check (
  (select public.can_manage_team_calendar())
  and public.is_calendar_member(user_id)
);

commit;
