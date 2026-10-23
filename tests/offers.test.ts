import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { parseOfferAppointmentInput, parseOfferInput } from "../lib/offers";

const A = "00000000-0000-4000-8000-000000000001";
const B = "00000000-0000-4000-8000-000000000002";
const offerId = "00000000-0000-4000-8000-000000000010";
const fileId = "00000000-0000-4000-8000-000000000011";

test("offer input validates dates and direct recipients", () => {
  assert.equal(
    parseOfferInput({
      title: "A",
      customer_name: "B",
      starts_at: "not-a-date",
    }),
    null,
  );
  assert.deepEqual(
    parseOfferInput({
      title: "Kalenderangebot",
      customer_name: "Kundin",
      starts_at: "2026-10-22T09:00:00Z",
    }),
    {
      title: "Kalenderangebot",
      customer_name: "Kundin",
      starts_at: "2026-10-22T09:00:00.000Z",
      notes: "",
      recipient_email: null,
      recipient_phone: null,
      hubspot_contact_id: null,
      superchat_contact_id: null,
    },
  );
  assert.equal(
    parseOfferInput({
      title: "A",
      customer_name: "B",
      starts_at: "2026-10-22T09:00",
    }),
    null,
  );
  assert.deepEqual(
    parseOfferInput({
      title: " Angebot ",
      customer_name: " Kundin ",
      starts_at: "2026-10-22T09:00:00.000Z",
      recipient_email: " kunde@example.de ",
      recipient_phone: "+491701234567",
      hubspot_contact_id: "123",
    }),
    {
      title: "Angebot",
      customer_name: "Kundin",
      starts_at: "2026-10-22T09:00:00.000Z",
      notes: "",
      recipient_email: "kunde@example.de",
      recipient_phone: "+491701234567",
      hubspot_contact_id: "123",
      superchat_contact_id: null,
    },
  );
  assert.equal(
    parseOfferInput({
      title: "Angebot",
      customer_name: "Kundin",
      starts_at: "2026-10-22T09:00:00Z",
      recipient_email: "kunde@example.de",
      recipient_phone: "01701234567",
    }),
    null,
  );
});

test("appointment input requires an ordered time range", () => {
  assert.equal(
    parseOfferAppointmentInput({
      title: "Follow-up",
      starts_at: "2026-10-22T09:00:00Z",
      ends_at: "2026-10-22T08:00:00Z",
    }),
    null,
  );
  assert.deepEqual(
    parseOfferAppointmentInput({
      title: " Follow-up ",
      starts_at: "2026-10-22T09:00:00Z",
    }),
    {
      title: "Follow-up",
      starts_at: "2026-10-22T09:00:00.000Z",
      ends_at: null,
      notes: "",
    },
  );
});

test("offer migration protects owners and atomically prepares dispatch", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create schema storage;
      create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text);
      create function storage.foldername(path text) returns text[] language sql immutable as $$ select string_to_array(path, '/') $$;
      alter table storage.objects enable row level security;
      grant usage on schema public, auth, storage to authenticated, anon;
      grant execute on function auth.uid() to authenticated, anon;
      grant select on storage.objects to authenticated;`);
    for (const file of [
      "202609280001_goal_track.sql",
      "202610220001_offers.sql",
    ]) {
      await db.exec(
        await readFile(
          new URL(`../supabase/migrations/${file}`, import.meta.url),
          "utf8",
        ),
      );
    }
    await db.query(
      "insert into auth.users(id,email) values ($1,'a@test.invalid'),($2,'b@test.invalid')",
      [A, B],
    );
    await db.query("update public.profiles set active = true");
    async function asUser<T>(id: string, action: () => Promise<T>) {
      await db.exec("begin; set local role authenticated;");
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
    await asUser(A, () =>
      db.query(
        `insert into public.offers(id,owner_id,title,customer_name,starts_at,hubspot_contact_id)
      values ($1,$2,'Offer','Private Customer','2026-10-22T09:00:00Z','contact-1')`,
        [offerId, A],
      ),
    );
    const hidden = await asUser(B, () =>
      db.query("select id from public.offers"),
    );
    assert.equal(hidden.rows.length, 0);
    await asUser(A, () =>
      db.query(
        "insert into public.offer_appointments(offer_id,owner_id,title,starts_at) values ($1,$2,'Follow-up','2026-10-29T09:00:00Z')",
        [offerId, A],
      ),
    );
    await asUser(A, () =>
      db.query(
        "insert into public.offer_appointments(offer_id,owner_id,title,starts_at) values ($1,$2,'Second follow-up','2026-11-12T09:00:00Z')",
        [offerId, A],
      ),
    );
    const ownAppointments = await asUser(A, () => db.query("select id from public.offer_appointments"));
    assert.equal(ownAppointments.rows.length, 2);
    const hiddenAppointments = await asUser(B, () =>
      db.query("select id from public.offer_appointments"),
    );
    assert.equal(hiddenAppointments.rows.length, 0);
    await assert.rejects(
      asUser(B, () =>
        db.query(
          "insert into public.offer_appointments(offer_id,owner_id,title,starts_at) values ($1,$2,'Foreign','2026-10-29T10:00:00Z')",
          [offerId, B],
        ),
      ),
    );
    await assert.rejects(
      asUser(B, () =>
        db.query("select public.request_offer_dispatch($1)", [offerId]),
      ),
    );
    await assert.rejects(
      asUser(A, () =>
        db.query("select public.request_offer_dispatch($1)", [offerId]),
      ),
    );
    const path = `${A}/${offerId}/${fileId}.pdf`;
    await db.query(
      "insert into storage.objects(bucket_id,name) values ('offer-pdfs',$1)",
      [path],
    );
    await asUser(A, () =>
      db.query(
        "update public.offers set pdf_path=$1,pdf_name='offer.pdf',pdf_size=100,status='ready' where id=$2",
        [path, offerId],
      ),
    );
    const prepared = await asUser(A, () =>
      db.query<{ request_offer_dispatch: string }>(
        "select public.request_offer_dispatch($1)",
        [offerId],
      ),
    );
    assert.ok(prepared.rows[0].request_offer_dispatch);
    const event = await asUser(A, () =>
      db.query<{ state: string; pdf_path: string }>(
        "select state,pdf_path from public.offer_dispatch_events",
      ),
    );
    assert.deepEqual(event.rows, [
      { state: "pending_connection", pdf_path: path },
    ]);
    await assert.rejects(
      asUser(A, () =>
        db.query("select public.request_offer_dispatch($1)", [offerId]),
      ),
    );
    const forged = await asUser(A, () =>
      db.query("update public.offers set status='sent' where id=$1", [offerId]),
    );
    assert.equal(forged.affectedRows, 0);
    const current = await asUser(A, () =>
      db.query<{ status: string }>(
        "select status from public.offers where id=$1",
        [offerId],
      ),
    );
    assert.equal(current.rows[0].status, "pending_connection");
  } finally {
    await db.close();
  }
});
