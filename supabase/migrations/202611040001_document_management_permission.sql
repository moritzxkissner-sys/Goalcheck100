-- Preserve existing document maintainers while separating future calendar grants.
begin;

alter table public.profiles
  add column can_manage_training_documents boolean not null default false;

update public.profiles
set can_manage_training_documents = can_manage_team_calendar;

create function public.can_manage_training_documents() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.active
      and p.can_manage_training_documents
  );
$$;
revoke all on function public.can_manage_training_documents() from public, anon, authenticated;
grant execute on function public.can_manage_training_documents() to authenticated;

alter policy training_documents_manager_insert on public.training_documents
  with check ((select public.can_manage_training_documents()) and owner_id = (select auth.uid()));
alter policy training_documents_manager_update on public.training_documents
  using ((select public.can_manage_training_documents()))
  with check ((select public.can_manage_training_documents()));

alter policy training_files_manager_insert on storage.objects
  with check (
    bucket_id = 'training-documents'
    and (select public.can_manage_training_documents())
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.pdf$'
  );
alter policy training_files_orphan_cleanup on storage.objects
  using (
    bucket_id = 'training-documents'
    and (select public.can_manage_training_documents())
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not exists (select 1 from public.training_documents d where d.storage_path = name)
  );

alter policy academy_draft_read on public.academy_question_drafts
  using ((select public.is_team_member()) and (status = 'approved' or (select public.can_manage_training_documents())));
alter policy academy_draft_insert on public.academy_question_drafts
  with check ((select public.can_manage_training_documents()) and created_by = (select auth.uid()));
alter policy academy_draft_update on public.academy_question_drafts
  using ((select public.can_manage_training_documents()))
  with check ((select public.can_manage_training_documents()));

commit;
