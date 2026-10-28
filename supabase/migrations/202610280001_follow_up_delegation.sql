begin;

alter table public.follow_up_tasks drop constraint follow_up_owner_assignee;
create index follow_up_tasks_assignee_calendar_idx on public.follow_up_tasks(assigned_to, start_time, id);

-- A roster for this feature deliberately contains only real, active accounts.
create function public.follow_up_members()
returns table(id uuid, full_name text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.full_name from public.profiles p
  where p.active and (select public.is_team_member())
    and (p.id = (select auth.uid()) or (select public.can_manage_team_calendar()))
  order by p.full_name, p.id;
$$;
revoke all on function public.follow_up_members() from public, anon, authenticated;
grant execute on function public.follow_up_members() to authenticated;

create function public.guard_follow_up_assignment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'Appointment creator cannot be changed' using errcode = '42501';
  end if;
  if new.assigned_to is distinct from old.assigned_to then
    if old.owner_id is distinct from (select auth.uid())
       or not public.can_manage_team_calendar() then
      raise exception 'Only an authorized creator can reassign appointments' using errcode = '42501';
    end if;
    if not public.is_calendar_member(new.assigned_to) then
      raise exception 'An active recipient is required' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_follow_up_assignment() from public, anon, authenticated;
create trigger guard_follow_up_assignment before update on public.follow_up_tasks
for each row execute function public.guard_follow_up_assignment();

drop policy follow_up_owner_read on public.follow_up_tasks;
drop policy follow_up_owner_insert on public.follow_up_tasks;
drop policy follow_up_owner_update on public.follow_up_tasks;
drop policy follow_up_owner_delete on public.follow_up_tasks;
create policy follow_up_participant_read on public.follow_up_tasks for select to authenticated
using ((owner_id = (select auth.uid()) or assigned_to = (select auth.uid())) and (select public.is_team_member()));
create policy follow_up_creator_insert on public.follow_up_tasks for insert to authenticated
with check (owner_id = (select auth.uid()) and (select public.is_team_member())
  and public.is_calendar_member(assigned_to)
  and (assigned_to = (select auth.uid()) or (select public.can_manage_team_calendar())));
create policy follow_up_participant_update on public.follow_up_tasks for update to authenticated
using ((owner_id = (select auth.uid()) or assigned_to = (select auth.uid())) and (select public.is_team_member()))
with check ((owner_id = (select auth.uid()) or assigned_to = (select auth.uid())) and (select public.is_team_member()));
create policy follow_up_participant_delete on public.follow_up_tasks for delete to authenticated
using ((owner_id = (select auth.uid()) or assigned_to = (select auth.uid())) and (select public.is_team_member()));

commit;

