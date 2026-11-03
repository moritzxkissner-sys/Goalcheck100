begin;
alter table public.training_documents
  add column insurance_line text not null default '' check (char_length(insurance_line) <= 120),
  add column product text not null default '' check (char_length(product) <= 120),
  add column insurer text not null default '' check (char_length(insurer) <= 120),
  add column document_version text not null default 'Bestand' check (char_length(trim(document_version)) between 1 and 80),
  add column valid_from date,
  add column module_id text,
  add column processing_status text not null default 'uploaded' check (processing_status in ('uploaded','review_pending','approved','archived'));
create function public.is_academy_module(value text) returns boolean language sql immutable set search_path = '' as $$
 select value in ('specialist-privatkunden-grundlagen','specialist-recht-gewerbe-grundlagen','specialist-gesundheit-grundlagen','specialist-lebensversicherung-grundlagen','salespower-gkv-grundlagen','salespower-grv-grundlagen','salespower-rechtsschutz-grundlagen','salespower-hausrat-grundlagen','salespower-haftpflicht-grundlagen','salespower-wohngebaeude-grundlagen','salespower-recht-und-heim-grundlagen')
$$;
alter table public.training_documents add constraint training_document_module check (module_id is null or public.is_academy_module(module_id));
drop policy training_documents_owner_insert on public.training_documents;
drop policy training_documents_owner_delete on public.training_documents;
create policy training_documents_manager_insert on public.training_documents for insert to authenticated with check ((select public.can_manage_team_calendar()) and owner_id = (select auth.uid()));
create policy training_documents_manager_update on public.training_documents for update to authenticated using ((select public.can_manage_team_calendar())) with check ((select public.can_manage_team_calendar()));
revoke insert, update, delete on public.training_documents from authenticated;
grant insert on public.training_documents to authenticated;
grant update (insurance_line, product, insurer, document_version, valid_from, module_id, processing_status) on public.training_documents to authenticated;
drop policy training_files_owner_insert on storage.objects;
create policy training_files_manager_insert on storage.objects for insert to authenticated with check (bucket_id = 'training-documents' and (select public.can_manage_team_calendar()) and (storage.foldername(name))[1] = (select auth.uid())::text and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.pdf$');
-- Allow only cleanup of an unsuccessful upload, never removal of a linked source file.
drop policy training_files_owner_delete on storage.objects;
create policy training_files_orphan_cleanup on storage.objects for delete to authenticated using (bucket_id = 'training-documents' and (select public.can_manage_team_calendar()) and (storage.foldername(name))[1] = (select auth.uid())::text and not exists (select 1 from public.training_documents d where d.storage_path = name));
create table public.academy_question_drafts (
 id uuid primary key default gen_random_uuid(),
 document_id uuid not null references public.training_documents(id) on delete restrict,
 document_version text not null check (char_length(trim(document_version)) between 1 and 80),
 citation text not null check (char_length(trim(citation)) between 1 and 2000),
 prompt text not null check (char_length(trim(prompt)) between 1 and 1000),
 choices text[] not null check (array_length(choices,1) between 2 and 6),
 correct_indices integer[] not null check (array_length(correct_indices,1) between 1 and 6),
 explanation text not null check (char_length(trim(explanation)) between 1 and 3000),
 module_id text not null check (public.is_academy_module(module_id)),
 status text not null default 'draft' check (status in ('draft','review_pending','approved','rejected')),
 created_by uuid not null references public.profiles(id),
 reviewed_by uuid references public.profiles(id), reviewed_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index academy_question_drafts_document_idx on public.academy_question_drafts(document_id,created_at desc);
alter table public.academy_question_drafts enable row level security;
create policy academy_draft_read on public.academy_question_drafts for select to authenticated using ((select public.is_team_member()) and (status = 'approved' or (select public.can_manage_team_calendar())));
create policy academy_draft_insert on public.academy_question_drafts for insert to authenticated with check ((select public.can_manage_team_calendar()) and created_by = (select auth.uid()));
create policy academy_draft_update on public.academy_question_drafts for update to authenticated using ((select public.can_manage_team_calendar())) with check ((select public.can_manage_team_calendar()));
revoke all on public.academy_question_drafts from public, anon, authenticated;
grant select on public.academy_question_drafts to authenticated;
grant insert (document_id,document_version,citation,prompt,choices,correct_indices,explanation,module_id,status,created_by) on public.academy_question_drafts to authenticated;
grant update (citation,prompt,choices,correct_indices,explanation,module_id,status) on public.academy_question_drafts to authenticated;
grant all on public.academy_question_drafts to service_role;
create function public.validate_academy_question_source() returns trigger language plpgsql security definer set search_path = '' as $$
declare source public.training_documents; item text; answer integer;
begin
 select * into source from public.training_documents where id = new.document_id for update;
 if source.id is null or source.document_version <> new.document_version or source.processing_status = 'archived' then raise exception 'Invalid or archived document version'; end if;
 if new.status = 'approved' and (source.processing_status <> 'approved' or source.valid_from > current_date or trim(source.insurance_line) = '' or trim(source.product) = '' or trim(source.insurer) = '') then raise exception 'Source is not approved or valid'; end if;
 if cardinality(new.choices) not between 2 and 6 or cardinality(new.correct_indices) not between 1 and 6 or array_ndims(new.choices) <> 1 or array_lower(new.choices,1) <> 1 or array_ndims(new.correct_indices) <> 1 then raise exception 'Invalid answers'; end if;
 foreach item in array new.choices loop if item is null or char_length(trim(item)) not between 1 and 500 then raise exception 'Invalid choice'; end if; end loop;
 foreach answer in array new.correct_indices loop if answer is null or answer < 0 or answer >= cardinality(new.choices) then raise exception 'Invalid correct index'; end if; end loop;
 if (select count(distinct n) from unnest(new.correct_indices) n) <> cardinality(new.correct_indices) then raise exception 'Duplicate correct index'; end if;
 if tg_op = 'UPDATE' and (old.document_id <> new.document_id or old.document_version <> new.document_version) then raise exception 'Source is immutable'; end if;
 if new.status in ('approved','rejected') then new.reviewed_by := auth.uid(); new.reviewed_at := now(); else new.reviewed_by := null; new.reviewed_at := null; end if;
 new.updated_at := now(); return new;
end $$;
create trigger academy_question_source before insert or update on public.academy_question_drafts for each row execute function public.validate_academy_question_source();
create function public.protect_academy_source_version() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if new.document_version <> old.document_version and exists (select 1 from public.academy_question_drafts where document_id = old.id) then raise exception 'Version referenced by question drafts is immutable'; end if;
 -- Metadata edits invalidate every previous approval and require another review.
 if row(new.insurance_line,new.product,new.insurer,new.valid_from,new.module_id,new.processing_status) is distinct from row(old.insurance_line,old.product,old.insurer,old.valid_from,old.module_id,old.processing_status) then
 update public.academy_question_drafts set status = 'review_pending', reviewed_by = null, reviewed_at = null where document_id = old.id and status = 'approved';
 end if;
 return new;
end $$;
create trigger protect_academy_source before update on public.training_documents for each row execute function public.protect_academy_source_version();
revoke all on function public.validate_academy_question_source(), public.protect_academy_source_version() from public,anon,authenticated;
commit;

