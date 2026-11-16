begin;
alter table public.profiles add column can_manage_underwriting boolean not null default false;
-- The operator explicitly authorized Steven. No name-based or metadata-based grants.
do $$ begin
 if not exists(select 1 from public.profiles where id='cccbfd5f-fba1-40cb-ad01-cad4ac6a9893' and active and btrim(full_name)='Steven Prell') then
  raise exception 'Stevens aktives Profil bitte vor der Freigabe prüfen';
 end if;
end; $$;
update public.profiles set can_manage_underwriting=true where id='cccbfd5f-fba1-40cb-ad01-cad4ac6a9893' and active;
create function public.can_manage_underwriting() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=(select auth.uid()) and active and can_manage_underwriting);
$$;
revoke all on function public.can_manage_underwriting() from public,anon,authenticated;
grant execute on function public.can_manage_underwriting() to authenticated;
create table public.underwriting_requests(
 id uuid primary key,
 user_id uuid not null references public.profiles(id),
 creator_name text not null,
 department text not null check(department in ('Rechtsschutz','SHU')),
 customer_name text not null check(length(btrim(customer_name)) between 1 and 120),
 subject text not null check(length(btrim(subject)) between 1 and 180),
 message text not null check(length(btrim(message)) between 1 and 1000),
 status text not null default 'open' check(status in ('open','in_progress','question','completed')),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),completed_at timestamptz
);
create index underwriting_owner_created_idx on public.underwriting_requests(user_id,created_at desc,id);
create index underwriting_status_idx on public.underwriting_requests(status,completed_at);
create table public.underwriting_attachments(
 id uuid primary key default gen_random_uuid(),request_id uuid not null references public.underwriting_requests(id) on delete cascade,
 path text not null unique,name text not null check(length(name) between 1 and 180),size bigint not null check(size between 1 and 10485760),type text not null check(type in ('application/pdf','image/jpeg','image/png'))
);
create index underwriting_attachments_request_idx on public.underwriting_attachments(request_id);
create table public.underwriting_events(
 id uuid primary key default gen_random_uuid(),request_id uuid not null references public.underwriting_requests(id) on delete cascade,
 user_id uuid not null references public.profiles(id),author_name text not null,note text not null check(length(btrim(note)) between 1 and 1200),created_at timestamptz not null default now()
);
create index underwriting_events_request_idx on public.underwriting_events(request_id,created_at);
alter table public.underwriting_requests enable row level security;
alter table public.underwriting_attachments enable row level security;
alter table public.underwriting_events enable row level security;
create policy underwriting_read on public.underwriting_requests for select to authenticated using (public.is_team_member() and (user_id=auth.uid() or public.can_manage_underwriting()));
create policy underwriting_update on public.underwriting_requests for update to authenticated using (public.is_team_member() and (user_id=auth.uid() or public.can_manage_underwriting())) with check (public.is_team_member() and (user_id=auth.uid() or public.can_manage_underwriting()));
create policy underwriting_attachment_read on public.underwriting_attachments for select to authenticated using (exists(select 1 from public.underwriting_requests r where r.id=request_id));
create policy underwriting_event_read on public.underwriting_events for select to authenticated using (exists(select 1 from public.underwriting_requests r where r.id=request_id));
revoke all on public.underwriting_requests,public.underwriting_attachments,public.underwriting_events from anon,authenticated;
grant select on public.underwriting_requests,public.underwriting_attachments,public.underwriting_events to authenticated;
grant update(department,customer_name,subject,message,status) on public.underwriting_requests to authenticated;
grant all on public.underwriting_requests,public.underwriting_attachments,public.underwriting_events to service_role;
create function public.audit_underwriting() returns trigger language plpgsql security definer set search_path='' as $$
declare who text; description text;
begin
 select full_name into who from public.profiles where id=auth.uid();
 if TG_OP='INSERT' then description:='Anfrage erstellt';
 else
  new.updated_at:=now();
  new.completed_at:=case when new.status='completed' then coalesce(old.completed_at,now()) else null end;
  description:=case when old.status<>new.status then 'Status: '||old.status||' → '||new.status else 'Anfragedaten bearbeitet' end;
 end if;
 insert into public.underwriting_events(request_id,user_id,author_name,note) values(new.id,auth.uid(),coalesce(who,'Teammitglied'),description);
 return new;
end; $$;
-- AFTER INSERT ensures the history FK can resolve the new request.
create trigger underwriting_insert_audit after insert on public.underwriting_requests for each row execute function public.audit_underwriting();
create trigger underwriting_update_audit before update on public.underwriting_requests for each row execute function public.audit_underwriting();
revoke all on function public.audit_underwriting() from public,anon,authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('underwriting','underwriting',false,10485760,array['application/pdf','image/jpeg','image/png']);
create policy underwriting_upload on storage.objects for insert to authenticated with check(bucket_id='underwriting' and (storage.foldername(name))[1]=auth.uid()::text and public.is_team_member());
create policy underwriting_download on storage.objects for select to authenticated using(bucket_id='underwriting' and exists(select 1 from public.underwriting_attachments a join public.underwriting_requests r on r.id=a.request_id where a.path=storage.objects.name));
create function public.create_underwriting(payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); rid uuid:=(payload->>'id')::uuid; who text; f jsonb; stored_size bigint; stored_type text;
begin
 if not public.is_team_member() then raise exception 'Aktiver Teamzugang erforderlich' using errcode='42501'; end if;
 select full_name into who from public.profiles where id=uid;
 if exists(select 1 from public.underwriting_requests where id=rid) then
  if exists(select 1 from public.underwriting_requests where id=rid and user_id=uid
    and department=payload->>'department' and customer_name=payload->>'customer_name'
    and subject=payload->>'subject' and message=payload->>'message')
    and (select coalesce(jsonb_agg(jsonb_build_object('path',a.path,'name',a.name,'size',a.size,'type',a.type) order by a.path),'[]'::jsonb) from public.underwriting_attachments a where a.request_id=rid)
      = (select coalesce(jsonb_agg(incoming.value order by incoming.value->>'path'),'[]'::jsonb) from jsonb_array_elements(payload->'attachments') as incoming(value))
   then return rid; end if;
  raise exception 'Ungültige Anfrage-ID';
 end if;
 if jsonb_typeof(payload->'attachments')<>'array' or jsonb_array_length(payload->'attachments')>5 then raise exception 'Maximal fünf Anhänge'; end if;
 insert into public.underwriting_requests(id,user_id,creator_name,department,customer_name,subject,message) values(rid,uid,who,payload->>'department',payload->>'customer_name',payload->>'subject',payload->>'message');
 for f in select * from jsonb_array_elements(payload->'attachments') loop
  if split_part(f->>'path','/',1)<>uid::text or split_part(f->>'path','/',2)<>rid::text then raise exception 'Ungültiger Anhang'; end if;
  select (metadata->>'size')::bigint,metadata->>'mimetype' into stored_size,stored_type from storage.objects where bucket_id='underwriting' and name=f->>'path';
  if stored_size is null or stored_size<>(f->>'size')::bigint or stored_type<>f->>'type' then raise exception 'Anhang nicht vollständig hochgeladen'; end if;
  insert into public.underwriting_attachments(request_id,path,name,size,type) values(rid,f->>'path',f->>'name',stored_size,stored_type);
 end loop;
 return rid;
end; $$;
create function public.comment_underwriting(rid uuid,content text) returns void language plpgsql security definer set search_path='' as $$
declare who text;
begin
 if not public.is_team_member() or not exists(select 1 from public.underwriting_requests where id=rid and (user_id=auth.uid() or public.can_manage_underwriting())) then raise exception 'Keine Berechtigung' using errcode='42501'; end if;
 select full_name into who from public.profiles where id=auth.uid();
 insert into public.underwriting_events(request_id,user_id,author_name,note) values(rid,auth.uid(),who,btrim(content));
end; $$;
revoke all on function public.create_underwriting(jsonb),public.comment_underwriting(uuid,text) from public,anon,authenticated;
grant execute on function public.create_underwriting(jsonb),public.comment_underwriting(uuid,text) to authenticated;
-- Search options use exactly the same row-level visibility as the source data.
create function public.underwriting_customers() returns table(customer_name text)
language sql stable security invoker set search_path='' as $$
 select distinct e.customer_name from public.sales_entries e where btrim(e.customer_name)<>''
 union select distinct r.customer_name from public.underwriting_requests r where btrim(r.customer_name)<>''
 order by 1;
$$;
revoke all on function public.underwriting_customers() from public,anon,authenticated;
grant execute on function public.underwriting_customers() to authenticated;
commit;
