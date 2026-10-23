import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const owner = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const offerId = "00000000-0000-4000-8000-000000000010";
const pdfPath = `${owner}/${offerId}/00000000-0000-4000-8000-000000000011.pdf`;
const oversizedOfferId = "00000000-0000-4000-8000-000000000012";
const oversizedPdfPath = `${owner}/${oversizedOfferId}/00000000-0000-4000-8000-000000000013.pdf`;

test("offer deliveries are private, idempotent and retry only confirmed failures", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth; create schema storage;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create table public.profiles(id uuid primary key, active boolean not null default true);
      create function public.is_team_member() returns boolean language sql stable as $$
        select exists(select 1 from public.profiles where id = auth.uid() and active) $$;
      create table storage.buckets(id text primary key, name text, public boolean,
        file_size_limit integer, allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),
        bucket_id text, name text);
      create function storage.foldername(text) returns text[] language sql immutable as $$
        select string_to_array($1, '/') $$;
      grant usage on schema public, auth, storage to authenticated, anon, service_role;
      grant execute on function auth.uid() to authenticated, anon, service_role;
      grant execute on function public.is_team_member() to authenticated, anon, service_role;
      grant select on public.profiles to authenticated, anon, service_role;
    `);
    await db.exec(await readFile(new URL("../supabase/migrations/202610220001_offers.sql", import.meta.url), "utf8"));
    await db.exec(await readFile(new URL("../supabase/migrations/202610230001_offer_deliveries.sql", import.meta.url), "utf8"));
    await db.query("insert into public.profiles(id) values ($1),($2)", [owner, other]);
    await db.query(`insert into public.offers(id,owner_id,title,customer_name,starts_at,pdf_name,pdf_size,pdf_path,status,recipient_email,recipient_phone)
      values ($1,$2,'Test','Customer',now(),'offer.pdf',4,$3,'ready','a@example.test','+4912345678')`, [offerId, owner, pdfPath]);
    await db.query("insert into storage.objects(bucket_id,name) values ('offer-pdfs',$1)", [pdfPath]);
    await db.query(`insert into public.offers(id,owner_id,title,customer_name,starts_at,pdf_name,pdf_size,pdf_path,status,recipient_email,recipient_phone)
      values ($1,$2,'Large','Customer',now(),'offer.pdf',2900001,$3,'ready','a@example.test','+4912345678')`, [oversizedOfferId, owner, oversizedPdfPath]);

    async function asUser<T>(id: string, operation: () => Promise<T>): Promise<T> {
      await db.exec("begin; set local role authenticated;");
      await db.query("select set_config('request.jwt.claim.sub', $1, true)", [id]);
      try {
        const result = await operation();
        await db.exec("commit");
        return result;
      } catch (error) {
        await db.exec("rollback");
        throw error;
      }
    }
    await assert.rejects(asUser(owner, () => db.query("select public.request_offer_dispatch($1,$2)", [offerId, owner])));
    await assert.rejects(db.query("select public.request_offer_dispatch($1,$2)", [offerId, other]));
    await assert.rejects(db.query("select public.request_offer_dispatch($1,$2)", [oversizedOfferId, owner]));
    const version = await db.query<{ updated_at: string }>(
      "select updated_at from public.offers where id=$1", [offerId],
    );
    await assert.rejects(db.query(
      "select public.request_offer_dispatch($1,$2,null,$3,$4,$5,$6)",
      [offerId, owner, pdfPath, "2000-01-01T00:00:00Z", "a@example.test", "+4912345678"],
    ));
    await assert.rejects(db.query(
      "select public.request_offer_dispatch($1,$2,null,$3,$4,$5,$6)",
      [offerId, owner, pdfPath, version.rows[0].updated_at, "other@example.test", "+4912345678"],
    ));
    assert.equal((await db.query("select id from public.offer_deliveries")).rows.length, 0);
    const initial = await db.query<{ request_offer_dispatch: {
      attempts: Array<{ attempt_id: string; channel: string; idempotency_key: string }>;
    } }>("select public.request_offer_dispatch($1,$2) as request_offer_dispatch", [offerId, owner]);
    const attempts = initial.rows[0].request_offer_dispatch.attempts;
    assert.deepEqual(attempts.map((item) => item.channel), ["email", "superchat"]);
    assert.notEqual(attempts[0].idempotency_key, attempts[1].idempotency_key);
    await assert.rejects(db.query("select public.request_offer_dispatch($1,$2)", [offerId, owner]));
    assert.equal((await asUser(other, () => db.query("select * from public.offer_deliveries"))).rows.length, 0);
    assert.equal((await asUser(owner, () => db.query("select * from public.offer_deliveries"))).rows.length, 2);

    const email = attempts[0].attempt_id;
    const chat = attempts[1].attempt_id;
    assert.equal((await db.query<{ record_offer_delivery_event: boolean }>(
      "select public.record_offer_delivery_event($1,'email-start','sending')", [email],
    )).rows[0].record_offer_delivery_event, true);
    assert.equal((await db.query<{ record_offer_delivery_event: boolean }>(
      "select public.record_offer_delivery_event($1,'email-start','sending')", [email],
    )).rows[0].record_offer_delivery_event, false);
    await db.query("select public.record_offer_delivery_event($1,'email-sent','sent','mail-1')", [email]);
    await db.query("select public.record_offer_delivery_event($1,'chat-start','sending')", [chat]);
    await db.query("select public.record_offer_delivery_event($1,'chat-timeout','unknown')", [chat]);
    await assert.rejects(db.query("select public.request_offer_dispatch($1,$2,'superchat')", [offerId, owner]));
    await db.query("select public.record_offer_delivery_event($1,'chat-failed','failed',null,'Provider rejected')", [chat]);
    await assert.rejects(db.query("select public.request_offer_dispatch($1,$2,'email')", [offerId, owner]));
    const retry = await db.query<{ request_offer_dispatch: {
      attempts: Array<{ attempt_id: string; channel: string }>;
    } }>("select public.request_offer_dispatch($1,$2,'superchat') as request_offer_dispatch", [offerId, owner]);
    assert.equal(retry.rows[0].request_offer_dispatch.attempts.length, 1);
    assert.equal(retry.rows[0].request_offer_dispatch.attempts[0].channel, "superchat");
    assert.equal((await db.query<{ record_offer_delivery_event: boolean }>(
      "select public.record_offer_delivery_event($1,'late-old','delivered')", [chat],
    )).rows[0].record_offer_delivery_event, false);
    const retriedChat = retry.rows[0].request_offer_dispatch.attempts[0].attempt_id;
    await db.query("select public.record_offer_delivery_event($1,'retry-start','sending')", [retriedChat]);
    await db.query("select public.record_offer_delivery_event($1,'retry-sent','sent','chat-2')", [retriedChat]);
    await db.query("select public.record_offer_delivery_event($1,'retry-read','read','chat-2')", [retriedChat]);
    const status = await db.query<{ status: string }>("select status from public.offers where id=$1", [offerId]);
    assert.equal(status.rows[0].status, "sent");
  } finally {
    await db.close();
  }
});
