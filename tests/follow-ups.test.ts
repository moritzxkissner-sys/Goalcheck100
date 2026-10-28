import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  berlinLocalToIso,
  isoToBerlinLocal,
  parseFollowUpInput,
  parseFollowUpRange,
} from "../lib/follow-ups";

const A = "00000000-0000-4000-8000-000000000001";
const B = "00000000-0000-4000-8000-000000000002";
const C = "00000000-0000-4000-8000-000000000003";
const D = "00000000-0000-4000-8000-000000000004";

test("follow-up assignees are optional and must be UUIDs", () => {
  const appointment = {
    title: "Anrufen",
    customer_name: "Kundin",
    offer_subject: "Angebot",
    start_time: "2026-10-27T08:00:00Z",
    end_time: "2026-10-27T08:30:00Z",
  };
  assert.equal(parseFollowUpInput(appointment)?.assigned_to, undefined);
  assert.equal(
    parseFollowUpInput({ ...appointment, assigned_to: B })?.assigned_to,
    B,
  );
  for (const assigned_to of [null, "", "invalid", 123])
    assert.equal(parseFollowUpInput({ ...appointment, assigned_to }), null);
  assert.equal(
    "owner_id" in parseFollowUpInput({ ...appointment, owner_id: B })!,
    false,
  );
});

test("follow-up input validates a standalone customer appointment", () => {
  const start_time = berlinLocalToIso("2026-10-27T09:00");
  const end_time = berlinLocalToIso("2026-10-27T09:30");
  assert.equal(start_time, "2026-10-27T08:00:00.000Z");
  assert.equal(isoToBerlinLocal(start_time!), "2026-10-27T09:00");
  assert.ok(
    parseFollowUpInput({
      title: "Follow-up",
      customer_name: "Kundin",
      offer_subject: "Rechtsschutz",
      start_time,
      end_time,
    }),
  );
  assert.equal(
    parseFollowUpInput({
      title: "Follow-up",
      customer_name: "Kundin",
      offer_subject: "Rechtsschutz",
      start_time: end_time,
      end_time: start_time,
    }),
    null,
  );
  assert.equal(
    parseFollowUpInput({
      title: "Follow-up",
      customer_name: "Kundin",
      offer_subject: "Rechtsschutz",
      start_time,
      end_time: "2026-10-28T08:00:00Z",
    }),
    null,
  );
  assert.equal(
    parseFollowUpInput({
      title: "Follow-up",
      customer_name: "Kundin",
      offer_subject: "Rechtsschutz",
      customer_phone: "01701234567",
      start_time,
      end_time,
    }),
    null,
  );
  assert.equal(
    parseFollowUpRange("2026-10-01", "2026-10-31")?.from,
    "2026-09-30T00:00:00.000Z",
  );
  assert.equal(parseFollowUpRange("2026-10-01", "2027-10-31"), null);
});

test("follow-up migrations preserve appointments and enforce creator/recipient delegation permissions", async () => {
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
      "202610230001_offer_deliveries.sql",
      "202610260001_followups_learning.sql",
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
    await db.query(
      "insert into public.offers(id,owner_id,title,customer_name,starts_at) values ('00000000-0000-4000-8000-000000000010',$1,'Rechtsschutz','Kundin','2026-10-27T08:00:00Z')",
      [A],
    );
    await db.query(
      "insert into public.offer_appointments(owner_id,offer_id,title,starts_at,ends_at,notes,due_date,assigned_to) values ($1,'00000000-0000-4000-8000-000000000010','Nachfassen','2026-10-27T08:00:00Z','2026-10-27T08:30:00Z','Anrufen','2026-10-27T08:00:00Z',$1)",
      [A],
    );
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/202610260002_standalone_follow_ups.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
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
    const migrated = await asUser(A, () =>
      db.query<{ customer_name: string; offer_subject: string }>(
        "select customer_name,offer_subject from public.follow_up_tasks",
      ),
    );
    assert.deepEqual(migrated.rows, [
      { customer_name: "Kundin", offer_subject: "Rechtsschutz" },
    ]);
    const hidden = await asUser(B, () =>
      db.query("select id from public.follow_up_tasks"),
    );
    assert.equal(hidden.rows.length, 0);
    await assert.rejects(
      asUser(B, () =>
        db.query(
          "insert into public.follow_up_tasks(owner_id,assigned_to,title,customer_name,offer_subject,start_time,end_time) values ($1,$1,'Test','Kunde','Thema','2026-10-27T08:00:00Z','2026-10-27T08:30:00Z')",
          [A],
        ),
      ),
    );
    const own = await asUser(B, () =>
      db.query(
        "insert into public.follow_up_tasks(owner_id,assigned_to,title,customer_name,offer_subject,start_time,end_time) values ($1,$1,'Test','Kunde','Thema','2026-10-27T08:00:00Z','2026-10-27T08:30:00Z') returning id",
        [B],
      ),
    );
    assert.equal(own.rows.length, 1);

    for (const file of [
      "202610120001_team_calendar.sql",
      "202610140001_calendar_roster.sql",
      "202610210001_calendar_partner_permissions.sql",
      "202610280001_follow_up_delegation.sql",
    ]) {
      await db.exec(
        await readFile(
          new URL(`../supabase/migrations/${file}`, import.meta.url),
          "utf8",
        ),
      );
    }
    await db.query(
      "insert into auth.users(id,email) values ($1,'c@test.invalid'),($2,'d@test.invalid')",
      [C, D],
    );
    await db.query("update public.profiles set active = true where id = $1", [
      C,
    ]);
    await db.query(
      "update public.profiles set can_manage_team_calendar = true where id in ($1,$2)",
      [A, C],
    );
    const create = (creator: string, recipient: string) =>
      db.query<{ id: string }>(
        "insert into public.follow_up_tasks(owner_id,assigned_to,title,customer_name,offer_subject,start_time,end_time) values ($1,$2,'Delegiert','Kunde','Thema','2026-10-27T08:00:00Z','2026-10-27T08:30:00Z') returning id",
        [creator, recipient],
      );
    const delegated = await asUser(A, () => create(A, B));
    const delegatedId = delegated.rows[0].id;
    assert.equal(
      (
        await asUser(B, () =>
          db.query("select id from public.follow_up_tasks where id = $1", [
            delegatedId,
          ]),
        )
      ).rows.length,
      1,
    );
    assert.equal(
      (
        await asUser(C, () =>
          db.query("select id from public.follow_up_tasks where id = $1", [
            delegatedId,
          ]),
        )
      ).rows.length,
      0,
      "unrelated manager cannot see customer appointments",
    );
    assert.equal(
      (
        await asUser(C, () =>
          db.query(
            "update public.follow_up_tasks set notes = 'intrusion' where id = $1 returning id",
            [delegatedId],
          ),
        )
      ).rows.length,
      0,
    );
    assert.equal(
      (
        await asUser(C, () =>
          db.query(
            "delete from public.follow_up_tasks where id = $1 returning id",
            [delegatedId],
          ),
        )
      ).rows.length,
      0,
    );
    assert.equal(
      (
        await asUser(B, () =>
          db.query(
            "update public.follow_up_tasks set notes = 'recipient edited' where id = $1 returning id",
            [delegatedId],
          ),
        )
      ).rows.length,
      1,
    );
    await assert.rejects(
      asUser(B, () => create(B, A)),
      /row-level security/,
    );
    await assert.rejects(
      asUser(A, () => create(B, B)),
      /row-level security/,
    );
    await assert.rejects(
      asUser(A, () => create(A, D)),
      /row-level security/,
    );
    await assert.rejects(
      asUser(B, () =>
        db.query(
          "update public.follow_up_tasks set owner_id = $1 where id = $2",
          [B, delegatedId],
        ),
      ),
      /creator cannot be changed/,
    );
    await assert.rejects(
      asUser(B, () =>
        db.query(
          "update public.follow_up_tasks set assigned_to = $1 where id = $2",
          [C, delegatedId],
        ),
      ),
      /authorized creator/,
    );
    await assert.rejects(
      asUser(A, () =>
        db.query(
          "update public.follow_up_tasks set assigned_to = $1 where id = $2",
          [D, delegatedId],
        ),
      ),
      /active recipient/,
    );
    await asUser(A, () =>
      db.query(
        "update public.follow_up_tasks set assigned_to = $1 where id = $2",
        [C, delegatedId],
      ),
    );
    assert.equal(
      (
        await asUser(B, () =>
          db.query("select id from public.follow_up_tasks where id = $1", [
            delegatedId,
          ]),
        )
      ).rows.length,
      0,
    );
    assert.equal(
      (
        await asUser(A, () =>
          db.query("select id from public.follow_up_tasks where id = $1", [
            delegatedId,
          ]),
        )
      ).rows.length,
      1,
    );
    await assert.rejects(
      asUser(C, () =>
        db.query(
          "update public.follow_up_tasks set assigned_to = $1 where id = $2",
          [B, delegatedId],
        ),
      ),
      /authorized creator/,
      "even a manager recipient cannot transfer another creator's task",
    );
    assert.equal(
      (
        await asUser(C, () =>
          db.query(
            "delete from public.follow_up_tasks where id = $1 returning id",
            [delegatedId],
          ),
        )
      ).rows.length,
      1,
    );
    assert.deepEqual(
      (
        await asUser(B, () =>
          db.query<{ id: string }>("select id from public.follow_up_members()"),
        )
      ).rows.map((row) => row.id),
      [B],
    );
    assert.deepEqual(
      new Set(
        (
          await asUser(A, () =>
            db.query<{ id: string }>(
              "select id from public.follow_up_members()",
            ),
          )
        ).rows.map((row) => row.id),
      ),
      new Set([A, B, C]),
    );
    await db.query(
      "update public.profiles set can_manage_team_calendar = false where id = $1",
      [A],
    );
    await assert.rejects(
      asUser(A, () => create(A, B)),
      /row-level security/,
    );
    await db.query("update public.profiles set active = false where id = $1", [
      B,
    ]);
    assert.equal(
      (await asUser(B, () => db.query("select id from public.follow_up_tasks")))
        .rows.length,
      0,
    );
    assert.equal(
      (
        await asUser(B, () =>
          db.query("select id from public.follow_up_members()"),
        )
      ).rows.length,
      0,
    );
  } finally {
    await db.close();
  }
});

