begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('training-documents', 'training-documents', false, 10485760, array['application/pdf'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table public.training_documents (
  id uuid primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  description text not null default '' check (char_length(description) <= 500),
  storage_path text not null unique,
  file_size integer not null check (file_size > 0 and file_size <= 10485760),
  created_at timestamptz not null default now(),
  constraint training_documents_path_owner check (storage_path = owner_id::text || '/' || id::text || '.pdf')
);
create index training_documents_created_idx on public.training_documents(created_at desc, id);
alter table public.training_documents enable row level security;
create policy training_documents_team_read on public.training_documents for select to authenticated
  using ((select public.is_team_member()));
create policy training_documents_owner_insert on public.training_documents for insert to authenticated
  with check (owner_id = (select auth.uid()) and (select public.is_team_member()));
create policy training_documents_owner_delete on public.training_documents for delete to authenticated
  using (owner_id = (select auth.uid()) and (select public.is_team_member()));
revoke all on public.training_documents from anon, authenticated;
grant select, insert, delete on public.training_documents to authenticated;
grant all on public.training_documents to service_role;

create policy training_files_team_read on storage.objects for select to authenticated
  using (bucket_id = 'training-documents' and (select public.is_team_member()));
create policy training_files_owner_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'training-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.pdf$'
    and (select public.is_team_member())
  );
create policy training_files_owner_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'training-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.is_team_member())
  );

commit;
