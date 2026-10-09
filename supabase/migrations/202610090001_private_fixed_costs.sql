-- Personal expense planning. These amounts are private EUR values and are
-- intentionally kept out of all BWS/team aggregates and security-definer RPCs.
begin;

create table public.fixed_costs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  amount numeric(12,2) not null check (amount > 0 and amount <= 999999999),
  cadence text not null check (cadence in ('monthly', 'quarterly', 'yearly')),
  created_at timestamptz not null default now()
);

create index fixed_costs_user_id_idx on public.fixed_costs(user_id);

alter table public.fixed_costs enable row level security;
alter table public.fixed_costs force row level security;

create policy own_fixed_costs_read on public.fixed_costs for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_team_member()));
create policy own_fixed_costs_insert on public.fixed_costs for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_team_member()));
create policy own_fixed_costs_update on public.fixed_costs for update to authenticated
  using (user_id = (select auth.uid()) and (select public.is_team_member()))
  with check (user_id = (select auth.uid()) and (select public.is_team_member()));
create policy own_fixed_costs_delete on public.fixed_costs for delete to authenticated
  using (user_id = (select auth.uid()) and (select public.is_team_member()));

revoke all on public.fixed_costs from public, anon, authenticated;
grant select, insert, update, delete on public.fixed_costs to authenticated;
grant all on public.fixed_costs to service_role;

commit;
