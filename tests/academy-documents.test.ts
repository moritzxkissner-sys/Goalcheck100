import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  parseDocumentMetadata,
  parseQuestionDraft,
} from "../lib/academy-documents";
const manager = "00000000-0000-4000-8000-000000000001",
  reader = "00000000-0000-4000-8000-000000000002",
  doc = "00000000-0000-4000-8000-000000000003";
const metadata = {
  insurance_line: "Sach",
  product: "Hausrat",
  insurer: "Quelle",
  document_version: "2026-1",
  valid_from: null,
  module_id: "salespower-hausrat-grundlagen",
  processing_status: "approved",
};
const draft = {
  document_id: doc,
  document_version: "2026-1",
  citation: "Seite 2: vereinbarte Bedingungen",
  prompt: "Welche Aussage?",
  choices: ["A", "B"],
  correct_indices: [0],
  explanation: "Begründung aus Quelle",
  module_id: "salespower-hausrat-grundlagen",
  status: "draft",
};
test("source metadata and manual draft validation rejects unsupported modules, versions and answers", () => {
  assert.ok(parseDocumentMetadata(metadata));
  assert.equal(
    parseDocumentMetadata({ ...metadata, valid_from: "2026-02-31" }),
    null,
  );
  assert.equal(
    parseDocumentMetadata({ ...metadata, module_id: "invented" }),
    null,
  );
  assert.ok(parseQuestionDraft(draft));
  assert.equal(parseQuestionDraft({ ...draft, document_version: "" }), null);
  assert.equal(parseQuestionDraft({ ...draft, correct_indices: [2] }), null);
  assert.equal(parseQuestionDraft({ ...draft, correct_indices: [0, 0] }), null);
  assert.equal(parseQuestionDraft({ ...draft, citation: "" }), null);
});
test("academy document migration enforces manager mutations, private reads and immutable reviewed source versions", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table public.profiles(id uuid primary key,active boolean,can_manage_team_calendar boolean);
 create function public.is_team_member() returns boolean language sql stable security definer as $$select coalesce((select active from public.profiles where id=auth.uid()),false)$$;
 create function public.can_manage_team_calendar() returns boolean language sql stable security definer as $$select coalesce((select active and can_manage_team_calendar from public.profiles where id=auth.uid()),false)$$;
 create table public.training_documents(id uuid primary key,owner_id uuid,title text,description text,storage_path text,file_size integer,created_at timestamptz default now());
 alter table public.training_documents enable row level security;
 create policy training_documents_team_read on public.training_documents for select to authenticated using(public.is_team_member());
 create policy training_documents_owner_insert on public.training_documents for insert to authenticated with check(owner_id=auth.uid());
 create policy training_documents_owner_delete on public.training_documents for delete to authenticated using(owner_id=auth.uid());
 grant select,insert,delete on public.training_documents to authenticated;
 create table storage.objects(id uuid,name text,bucket_id text);alter table storage.objects enable row level security;
 create function storage.foldername(value text) returns text[] language sql as $$ select string_to_array(value,'/') $$;
 create policy training_files_owner_insert on storage.objects for insert to authenticated with check(true);
 create policy training_files_owner_delete on storage.objects for delete to authenticated using(true);
 grant select,insert,delete on storage.objects to authenticated;
 create policy storage_read on storage.objects for select to authenticated using(public.is_team_member());
 grant usage on schema public,auth,storage to authenticated;grant execute on all functions in schema public,auth,storage to authenticated;
 insert into profiles values ('${manager}',true,true),('${reader}',true,false);`);
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/202611030002_academy_documents.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    async function asUser<T>(id: string, action: () => Promise<T>) {
      await db.exec("begin;set local role authenticated;");
      await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
        id,
      ]);
      try {
        const result = await action();
        await db.exec("commit");
        return result;
      } catch (error) {
        await db.exec("rollback");
        throw error;
      }
    }
    const insertDoc = () =>
      db.query(
        `insert into training_documents(id,owner_id,title,insurance_line,product,insurer,document_version,module_id,processing_status) values ($1,$2,'Quelle','Sach','Hausrat','Quelle','2026-1','salespower-hausrat-grundlagen','approved')`,
        [doc, manager],
      );
    await assert.rejects(asUser(reader, insertDoc));
    await asUser(manager, insertDoc);
    await assert.rejects(
      asUser(reader, () =>
        db.query(
          "insert into storage.objects(id,name,bucket_id) values ($1,$2,'training-documents')",
          [doc, reader + "/" + doc + ".pdf"],
        ),
      ),
    );
    await asUser(manager, () =>
      db.query(
        "insert into storage.objects(id,name,bucket_id) values ($1,$2,'training-documents')",
        [doc, manager + "/" + doc + ".pdf"],
      ),
    );
    await db.query("update training_documents set storage_path=$1", [
      manager + "/" + doc + ".pdf",
    ]);
    assert.equal(
      (
        await asUser(manager, () =>
          db.query("delete from storage.objects returning id"),
        )
      ).rows.length,
      0,
    );
    await assert.rejects(
      asUser(manager, () => db.query("delete from training_documents")),
    );

    assert.equal(
      (
        await asUser(reader, () =>
          db.query("select id from training_documents"),
        )
      ).rows.length,
      1,
    );
    assert.equal(
      (
        await asUser(reader, () =>
          db.query(
            "update training_documents set insurer='illegal' returning id",
          ),
        )
      ).rows.length,
      0,
    );
    const insertDraft = (version = "2026-1", status = "draft") =>
      db.query(
        `insert into academy_question_drafts(document_id,document_version,citation,prompt,choices,correct_indices,explanation,module_id,status,created_by) values ($1,$2,'Seite 2','Frage',array['A','B'],array[0],'Erklärung','salespower-hausrat-grundlagen',$3,$4)`,
        [doc, version, status, manager],
      );
    await assert.rejects(asUser(reader, () => insertDraft()));
    await assert.rejects(asUser(manager, () => insertDraft("wrong")));
    await asUser(manager, () => insertDraft());
    await assert.rejects(
      asUser(manager, () =>
        db.query("update academy_question_drafts set correct_indices=array[9]"),
      ),
    );
    await assert.rejects(
      asUser(manager, () =>
        db.query("update academy_question_drafts set citation=''"),
      ),
    );
    await db.query("update profiles set active=false where id=$1", [reader]);
    assert.equal(
      (
        await asUser(reader, () =>
          db.query("select id from training_documents"),
        )
      ).rows.length,
      0,
    );
    await db.query("update profiles set active=true where id=$1", [reader]);

    await assert.rejects(
      asUser(manager, () =>
        db.query("update training_documents set document_version='2026-2'"),
      ),
    );
    await asUser(manager, () =>
      db.query("update academy_question_drafts set status='approved'"),
    );
    assert.equal(
      (
        await asUser(reader, () =>
          db.query("select id from academy_question_drafts"),
        )
      ).rows.length,
      1,
    );
    await asUser(manager, () =>
      db.query("update training_documents set processing_status='archived'"),
    );
    assert.equal(
      (
        await asUser(reader, () =>
          db.query("select id from academy_question_drafts"),
        )
      ).rows.length,
      0,
    );
    await assert.rejects(
      asUser(manager, () =>
        db.query("update academy_question_drafts set status='approved'"),
      ),
    );
    await assert.rejects(asUser(manager, () => insertDraft()));
    await assert.rejects(
      asUser(reader, () => db.query("delete from training_documents")),
    );
    await asUser(manager, () =>
      db.query(
        "update training_documents set processing_status='approved',valid_from='2999-01-01'",
      ),
    );
    await assert.rejects(
      asUser(manager, () =>
        db.query("update academy_question_drafts set status='approved'"),
      ),
    );
  } finally {
    await db.close();
  }
});

