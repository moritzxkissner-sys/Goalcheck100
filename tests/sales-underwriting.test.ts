import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { splitBws, personalEntry } from "../lib/sale-sharing";
import { entrySchema } from "../lib/validation";
import {
  underwritingStats,
  validateUnderwritingFile,
  underwritingSchema,
} from "../lib/underwriting";
const A = "00000000-0000-4000-8000-000000000001",
  B = "00000000-0000-4000-8000-000000000002",
  C = "00000000-0000-4000-8000-000000000003",
  S = "cccbfd5f-fba1-40cb-ad01-cad4ac6a9893";
test("cent-exact sharing conserves BWS and validates percentages", () => {
  assert.deepEqual(splitBws(200, 50), { own: 100, partner: 100 });
  assert.deepEqual(splitBws(200, 70), { own: 140, partner: 60 });
  assert.deepEqual(splitBws(0.03, 50), { own: 0.02, partner: 0.01 });
  for (let cents = 1; cents < 1000; cents++)
    for (const percent of [1, 30, 50, 70, 99]) {
      const v = splitBws(cents / 100, percent);
      assert.equal(
        Math.round(v.own * 100) + Math.round(v.partner * 100),
        cents,
      );
    }
  const sale = {
    id: A,
    user_id: A,
    amount: 200,
    category: "Rechtsschutz" as const,
    transaction_type: "Neuvertrag" as const,
    occurred_on: "2020-09-01",
    customer_name: "Test",
    note: "",
    partner_id: B,
    owner_percent: 70,
  };
  assert.equal(personalEntry(sale, A).amount, 140);
  assert.equal(personalEntry(sale, B).amount, 60);
  assert.equal(
    entrySchema.safeParse({ ...sale, owner_percent: 120 }).success,
    false,
  );
  assert.equal(
    entrySchema.safeParse({ ...sale, partner_id: null, owner_percent: 70 })
      .success,
    false,
  );
  assert.equal(
    entrySchema.safeParse({ ...sale, partner_id: null, owner_percent: 100 })
      .success,
    true,
  );
});
test("underwriting guards and empty statistics do not invent figures", () => {
  assert.equal(
    validateUnderwritingFile({
      name: "a.pdf",
      type: "application/pdf",
      size: 10485760,
    }),
    null,
  );
  assert.ok(
    validateUnderwritingFile({
      name: "a.pdf",
      type: "application/pdf",
      size: 10485761,
    }),
  );
  assert.ok(
    validateUnderwritingFile({
      name: "a.exe",
      type: "application/pdf",
      size: 100,
    }),
  );
  assert.deepEqual(underwritingStats([]), {
    open: 0,
    completed: 0,
    averageDays: null,
  });
  assert.equal(
    underwritingSchema.safeParse({
      id: A,
      department: "SHU",
      customer_name: "Kunde",
      subject: "Anfrage",
      message: "x".repeat(1001),
    }).success,
    false,
  );
});
test("shared sales and underwriting enforce database rights, totals, history and attachments", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`,
    );
    const migration = async (name: string) =>
      db.exec(
        await readFile(
          new URL(`../supabase/migrations/${name}.sql`, import.meta.url),
          "utf8",
        ),
      );
    for (const name of [
      "202609280001_goal_track",
      "202609290001_team_performance",
      "202610010001_add_insurance_products",
    ])
      await migration(name);
    for (const [id, name] of [
      [A, "Partner A"],
      [B, "Partner B"],
      [C, "Unbeteiligt"],
      [S, "Steven Prell"],
    ])
      await db.query(
        `insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)`,
        [id, `${id}@example.test`, JSON.stringify({ full_name: name })],
      );
    await db.query(
      `insert into auth.users(id,email,raw_user_meta_data) values('00000000-0000-4000-8000-000000000099','moritz@example.test',$1)`,
      [JSON.stringify({ full_name: "Moritz Kissner" })],
    );
    await migration("202610070001_private_customer_names_team_visibility");
    await migration("202610070002_cancellation_entries");
    await db.exec("update public.profiles set active=true");
    await db.query(
      `insert into public.sales_entries(user_id,amount,category,transaction_type,occurred_on) values($1,40,'Rechtsschutz','Neuvertrag','2020-08-01')`,
      [A],
    );
    const legacyBefore = await db.query(
      "select id,user_id,amount,category,transaction_type,occurred_on,customer_name,note,created_at from public.sales_entries",
    );
    await db.exec(
      `create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,metadata jsonb);alter table storage.objects enable row level security;create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;grant usage on schema storage to authenticated;grant select,insert on storage.objects to authenticated;`,
    );
    await db.exec(
      await readFile(
        new URL("../supabase/setup-sales-underwriting.sql", import.meta.url),
        "utf8",
      ),
    );
    assert.deepEqual(
      (
        await db.query(
          "select id,user_id,amount,category,transaction_type,occurred_on,customer_name,note,created_at from public.sales_entries",
        )
      ).rows,
      legacyBefore.rows,
    );
    async function asUser<T>(id: string, fn: () => Promise<T>) {
      await db.exec("begin;set local role authenticated");
      await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
        id,
      ]);
      try {
        const result = await fn();
        await db.exec("commit");
        return result;
      } catch (e) {
        await db.exec("rollback");
        throw e;
      }
    }
    const sale = "10000000-0000-4000-8000-000000000001";
    await asUser(A, () =>
      db.query(
        `insert into public.sales_entries(id,user_id,amount,category,transaction_type,occurred_on,partner_id,owner_percent) values($1,$2,200,'Rechtsschutz','Neuvertrag','2020-09-01',$3,70)`,
        [sale, A, B],
      ),
    );
    const totals = await asUser(A, () =>
      db.query<{ user_id: string; total: string; entry_count: number }>(
        "select * from public.team_leaderboard('2020-09-01')",
      ),
    );
    assert.equal(Number(totals.rows.find((r) => r.user_id === A)?.total), 140);
    assert.equal(Number(totals.rows.find((r) => r.user_id === B)?.total), 60);
    assert.equal(
      totals.rows.reduce((s, r) => s + Number(r.total), 0),
      200,
    );
    assert.equal(
      totals.rows.reduce((s, r) => s + Number(r.entry_count), 0),
      1,
    );
    assert.equal(
      (await asUser(B, () => db.query("select * from public.sales_entries")))
        .rows.length,
      1,
    );
    assert.equal(
      (await asUser(C, () => db.query("select * from public.sales_entries")))
        .rows.length,
      0,
    );
    assert.equal(
      (
        await asUser(B, () =>
          db.query(
            "update public.sales_entries set owner_percent=50 where id=$1 returning id",
            [sale],
          ),
        )
      ).rows.length,
      0,
    );
    await assert.rejects(
      asUser(A, () =>
        db.query(
          "update public.sales_entries set owner_percent=101 where id=$1",
          [sale],
        ),
      ),
    );
    await assert.rejects(
      asUser(A, () =>
        db.query("update public.sales_entries set partner_id=$1 where id=$2", [
          A,
          sale,
        ]),
      ),
    );
    await asUser(A, () =>
      db.query("update public.sales_entries set owner_percent=50 where id=$1", [
        sale,
      ]),
    );
    const changed = await asUser(A, () =>
      db.query<{ user_id: string; total: string }>(
        "select * from public.team_leaderboard('2020-09-01')",
      ),
    );
    assert.equal(Number(changed.rows.find((r) => r.user_id === A)?.total), 100);
    assert.equal(Number(changed.rows.find((r) => r.user_id === B)?.total), 100);
    await asUser(A, () =>
      db.query(
        `insert into public.sales_entries(user_id,amount,category,transaction_type,occurred_on,partner_id,owner_percent) values($1,19.99,'Rechtsschutz','Neuvertrag',(now() at time zone 'Europe/Berlin')::date,$2,30)`,
        [A, B],
      ),
    );
    const day = await asUser(A, () =>
      db.query<{ user_id: string; total: string }>(
        "select * from public.team_daily_leaderboard()",
      ),
    );
    assert.equal(Number(day.rows.find((r) => r.user_id === A)?.total), 6);
    assert.equal(Number(day.rows.find((r) => r.user_id === B)?.total), 13.99);
    assert.equal(
      (
        await db.query(
          "select * from public.sales_entries where id='10000000-0000-4000-8000-000000000001'",
        )
      ).rows.length,
      1,
    );

    assert.equal(
      (
        await db.query(
          "select id from public.profiles where can_manage_underwriting",
        )
      ).rows.length,
      1,
    );
    const rid = "20000000-0000-4000-8000-000000000001",
      path = `${A}/${rid}/file.pdf`,
      payload = {
        id: rid,
        department: "SHU",
        customer_name: "Kunde A",
        subject: "Anfrage A",
        message: "Prüfung",
        attachments: [
          { path, name: "file.pdf", size: 100, type: "application/pdf" },
        ],
      };
    await assert.rejects(
      asUser(A, () =>
        db.query("select public.create_underwriting($1)", [payload]),
      ),
    );
    await assert.rejects(
      asUser(A, () =>
        db.query("select public.create_underwriting($1)", [
          { ...payload, message: "Abweichende Wiederholung" },
        ]),
      ),
    );
    assert.equal(
      (await db.query("select * from public.underwriting_requests")).rows
        .length,
      0,
    );
    await db.query(
      `insert into storage.objects(bucket_id,name,metadata) values('underwriting',$1,'{"size":100,"mimetype":"application/pdf"}')`,
      [path],
    );
    await asUser(A, () =>
      db.query("select public.create_underwriting($1)", [payload]),
    );
    await asUser(A, () =>
      db.query("select public.create_underwriting($1)", [payload]),
    );
    assert.equal(
      (await db.query("select * from public.underwriting_requests")).rows
        .length,
      1,
    );
    assert.equal(
      (
        await asUser(B, () =>
          db.query("select * from public.underwriting_requests"),
        )
      ).rows.length,
      0,
    );
    assert.equal(
      (
        await asUser(B, () =>
          db.query("select * from public.underwriting_attachments"),
        )
      ).rows.length,
      0,
    );
    assert.equal(
      (await asUser(B, () => db.query("select * from storage.objects"))).rows
        .length,
      0,
    );
    assert.equal(
      (await asUser(A, () => db.query("select * from storage.objects"))).rows
        .length,
      1,
    );
    assert.equal(
      (await asUser(S, () => db.query("select * from storage.objects"))).rows
        .length,
      1,
    );
    await assert.rejects(
      asUser(B, () =>
        db.query("select public.comment_underwriting($1,'Nicht erlaubt')", [
          rid,
        ]),
      ),
    );
    await asUser(S, () =>
      db.query(
        "update public.underwriting_requests set status='completed' where id=$1",
        [rid],
      ),
    );
    await asUser(A, () =>
      db.query("select public.comment_underwriting($1,'Danke')", [rid]),
    );
    assert.equal(
      (
        await asUser(A, () =>
          db.query("select * from public.underwriting_events"),
        )
      ).rows.length,
      3,
    );
    assert.equal(
      (
        await asUser(C, () =>
          db.query("select * from public.underwriting_events"),
        )
      ).rows.length,
      0,
    );
    assert.ok(
      (
        await db.query<{ completed_at: string }>(
          "select completed_at from public.underwriting_requests",
        )
      ).rows[0].completed_at,
    );
    await assert.rejects(
      asUser(A, () =>
        db.query(
          "update public.profiles set can_manage_underwriting=true where id=$1",
          [A],
        ),
      ),
    );
    await db.exec(`update public.profiles set active=false where id='${A}'`);
    assert.equal(
      (
        await asUser(A, () =>
          db.query("select * from public.underwriting_requests"),
        )
      ).rows.length,
      0,
    );
  } finally {
    await db.close();
  }
});
