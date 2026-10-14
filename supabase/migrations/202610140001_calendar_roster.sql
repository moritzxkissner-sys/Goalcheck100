-- Restore Moritz and Lilli to the team calendar. Julia and Lilli can be
-- displayed before their login accounts exist; placeholder IDs are replaced
-- by profile IDs as soon as those accounts become active.
begin;

create or replace function public.is_calendar_member(subject_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = subject_id and p.active
      and lower(regexp_replace(btrim(p.full_name), '[[:space:]]+', ' ', 'g')) not in (
        'alina dalga', 'alina dalgar'
      )
  );
$$;

create or replace function public.team_calendar_members()
returns table(id uuid, full_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_team_member() then
    raise exception 'Active team membership required' using errcode = '42501';
  end if;
  return query
    with active_members as (
      select p.id,
        case lower(regexp_replace(btrim(p.full_name), '[[:space:]]+', ' ', 'g'))
          when 'yuliia solianyk' then 'Julia Soljanik'::text
          when 'julia soljanik' then 'Julia Soljanik'::text
          when 'lilly fischer' then 'Lilli Fischer'::text
          when 'lilli fischer' then 'Lilli Fischer'::text
          else p.full_name
        end as full_name
      from public.profiles p
      where public.is_calendar_member(p.id)
    ),
    roster as (
      select a.id, a.full_name from active_members a
      union all
      select standby.id, standby.full_name
      from (values
        ('85f5c2d0-96a8-5db7-98a2-001020261014'::uuid, 'Julia Soljanik'::text),
        ('85f5c2d0-96a8-5db7-98a2-002020261014'::uuid, 'Lilli Fischer'::text),
        ('85f5c2d0-96a8-5db7-98a2-003020261014'::uuid, 'Moritz Kissner'::text)
      ) as standby(id, full_name)
      where not exists (
        select 1 from active_members a where a.full_name = standby.full_name
      )
    )
    select r.id, r.full_name from roster r order by r.full_name, r.id;
end;
$$;

commit;
