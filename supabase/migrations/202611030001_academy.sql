begin;
create table public.academy_progress (
  user_id uuid not null references public.profiles(id) on delete cascade,
  module_id text not null check (module_id ~ '^[a-z0-9-]{1,100}$'),
  attempt_id uuid not null,
  answers jsonb not null check (jsonb_typeof(answers) = 'array'),
  position integer not null check (position between 0 and 100),
  completed boolean not null default false,
  catalog_version text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, module_id)
);
create table public.academy_attempts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  attempt_id uuid not null,
  module_id text not null,
  answers jsonb not null check (jsonb_typeof(answers) = 'array'),
  catalog_version text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, attempt_id)
);
create index academy_attempts_user_created on public.academy_attempts(user_id, created_at desc);
alter table public.academy_progress enable row level security;
alter table public.academy_progress force row level security;
alter table public.academy_attempts enable row level security;
alter table public.academy_attempts force row level security;
create policy academy_progress_select on public.academy_progress for select to authenticated using (user_id = (select auth.uid()) and (select public.is_team_member()));
create policy academy_attempts_select on public.academy_attempts for select to authenticated using (user_id = (select auth.uid()) and (select public.is_team_member()));
revoke all on public.academy_progress, public.academy_attempts from public, anon, authenticated;
grant select on public.academy_progress, public.academy_attempts to authenticated;

-- All writes go through this atomic, authenticated operation. No client score is accepted.
create function public.save_academy_progress(p_module_id text, p_attempt_id uuid, p_answers jsonb, p_position integer, p_completed boolean, p_catalog_version text)
returns setof public.academy_progress
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_count integer;
  v_multi_index integer;
  v_answer jsonb;
  v_index integer;
  v_attempt public.academy_attempts;
begin
  if v_user is null or not public.is_team_member() then
    raise exception 'Active membership required' using errcode = '42501';
  end if;
  case p_module_id
    when 'salespower-rechtsschutz-grundlagen' then v_count := 3; v_multi_index := 2;
    when 'salespower-hausrat-grundlagen' then v_count := 3; v_multi_index := -1;
    when 'salespower-haftpflicht-grundlagen' then v_count := 2; v_multi_index := 1;
    when 'salespower-wohngebaeude-grundlagen' then v_count := 2; v_multi_index := -1;
    else raise exception 'Module unavailable' using errcode = '22023';
  end case;
  if p_catalog_version is distinct from '2026-11-03-v1' or p_attempt_id is null or p_completed is null or p_position is null or p_position < 0 or p_position > v_count or (p_completed and p_position <> v_count) or (not p_completed and p_position = v_count) or p_answers is null or jsonb_typeof(p_answers) <> 'array' then
    raise exception 'Invalid academy state' using errcode = '22023';
  end if;
  if jsonb_array_length(p_answers) <> v_count then raise exception 'Invalid answer count' using errcode = '22023'; end if;
  for v_index in 0..v_count-1 loop
    v_answer := p_answers -> v_index;
    if v_answer = 'null'::jsonb then
      if p_completed or v_index < p_position then raise exception 'Missing answer' using errcode = '22023'; end if;
    else
      if jsonb_typeof(v_answer) <> 'array' then raise exception 'Invalid selection' using errcode = '22023'; end if;
      if jsonb_array_length(v_answer) < 1 or jsonb_array_length(v_answer) > 3 or (v_index <> v_multi_index and jsonb_array_length(v_answer) <> 1) then raise exception 'Invalid selection count' using errcode = '22023'; end if;
      if exists (select 1 from jsonb_array_elements(v_answer) as a(value) where value not in ('0'::jsonb,'1'::jsonb,'2'::jsonb)) or (select count(*) <> count(distinct value) from jsonb_array_elements(v_answer) as a(value)) then raise exception 'Invalid selection values' using errcode = '22023'; end if;
    end if;
  end loop;
  -- Serialize saves for this person, including retries with an already completed ID.
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));
  select * into v_attempt from public.academy_attempts where user_id = v_user and attempt_id = p_attempt_id;
  if found then
    if not p_completed or v_attempt.module_id <> p_module_id or v_attempt.answers <> p_answers or v_attempt.catalog_version <> p_catalog_version then
      raise exception 'Completed attempt is immutable; start a new attempt' using errcode = '22023';
    end if;
    return query select * from public.academy_progress where user_id = v_user and module_id = p_module_id;
    return;
  end if;
  if p_completed then
    insert into public.academy_attempts(user_id, attempt_id, module_id, answers, catalog_version) values (v_user, p_attempt_id, p_module_id, p_answers, p_catalog_version);
  end if;
  return query insert into public.academy_progress(user_id,module_id,attempt_id,answers,position,completed,catalog_version)
    values (v_user,p_module_id,p_attempt_id,p_answers,p_position,p_completed,p_catalog_version)
    on conflict (user_id,module_id) do update set attempt_id = excluded.attempt_id, answers = excluded.answers, position = excluded.position, completed = excluded.completed, catalog_version = excluded.catalog_version, updated_at = now()
    returning *;
end;
$$;
revoke all on function public.save_academy_progress(text,uuid,jsonb,integer,boolean,text) from public, anon;
grant execute on function public.save_academy_progress(text,uuid,jsonb,integer,boolean,text) to authenticated;
commit;

