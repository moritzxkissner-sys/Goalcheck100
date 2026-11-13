import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  berlinLocalToIso,
  isoToBerlinLocal,
  parseFollowUpInput,
  parseFollowUpRange,
  parseFollowUpSearch,
  followUpSearchFilter,
  parseFollowUpOutcomeInput,
} from "../lib/follow-ups";

const A = "00000000-0000-4000-8000-000000000001";
const B = "00000000-0000-4000-8000-000000000002";
const C = "00000000-0000-4000-8000-000000000003";
const D = "00000000-0000-4000-8000-000000000004";

test("outcome patches accept one nullable result and no unrelated fields", () => {
  for (const outcome_status of [
    null,
    "no_show",
    "reschedule_requested",
    "sale",
  ])
    assert.deepEqual(parseFollowUpOutcomeInput({ outcome_status }), {
      outcome_status,
    });
  for (const input of [
    null,
    [],
    {},
    { outcome_status: "pending" },
    { outcome_status: undefined },
    { outcome_status: ["sale", "no_show"] },
    { outcome_status: "sale", status: "completed" },
    { outcome_status: null, start_time: "2026-11-13T09:00:00Z" },
  ])
    assert.equal(parseFollowUpOutcomeInput(input), null);
});

test("appointment types accept explicit values without guessing legacy types", () => {
  const appointment = {
    title: "Telefon Follow-up",
    customer_name: "Kundin",
    offer_subject: "Angebot",
    start_time: "2026-10-27T08:00:00Z",
    end_time: "2026-10-27T08:30:00Z",
  };
  assert.equal("appointment_type" in parseFollowUpInput(appointment)!, false);
  for (const appointment_type of [null, "follow_up", "phone"])
    assert.equal(
      parseFollowUpInput({ ...appointment, appointment_type })
        ?.appointment_type,
      appointment_type,
    );
  for (const appointment_type of ["", "Telefon", "unknown", 1, {}, []])
    assert.equal(
      parseFollowUpInput({ ...appointment, appointment_type }),
      null,
    );
});

test("global search validates independent Berlin date limits and bounded pages", () => {
  const parse = (params: string) =>
    parseFollowUpSearch(new URLSearchParams(params));
  assert.deepEqual(parse(""), {
    q: "",
    type: null,
    from: undefined,
    to: undefined,
    page: 0,
  });
  assert.deepEqual(parse("type=all&from=&to=&q=&page=0"), parse(""));
  assert.equal(parse("from=2026-03-29")?.from, "2026-03-28T23:00:00.000Z");
  assert.equal(parse("to=2026-03-29")?.to, "2026-03-29T22:00:00.000Z");
  assert.ok(
    parse("from=2020-01-01&to=2029-12-31&type=phone&page=12&q=Telefon"),
  );
  assert.ok(parse("from=2026-10-25&to=2026-10-25&type=follow_up"));
  for (const params of [
    "q=x",
    `q=${"a".repeat(121)}`,
    "type=other",
    "page=-1",
    "page=0.5",
    "page=1000000",
    "page=01",
    "from=2026-02-30",
    "to=2026-13-01",
    "from=2026-11-02&to=2026-11-01",
  ])
    assert.equal(parse(params), null, params);
});

test("search includes human type labels without classifying unknown appointments", () => {
  assert.match(followUpSearchFilter("Telefon"), /appointment_type\.eq\.phone/);
  assert.match(
    followUpSearchFilter("FOLLOW UP"),
    /appointment_type\.eq\.follow_up/,
  );
  assert.match(
    followUpSearchFilter("Follow-up"),
    /appointment_type\.eq\.follow_up/,
  );
  assert.doesNotMatch(followUpSearchFilter("Kundin"), /appointment_type/);
});

test("search quotes PostgREST syntax and treats regex/LIKE metacharacters literally", async () => {
  const db = new PGlite();
  try {
    for (const q of [
      "Acme, Inc. (Berlin)",
      '"),id.not.is.null',
      "%_*",
      "a\\b",
      "[a-z]+?^$|.*",
    ]) {
      const filter = followUpSearchFilter(q);
      const quoted = filter.match(
        /^customer_name\.imatch\.("(?:\\.|[^"\\])*")/,
      )?.[1];
      assert.ok(quoted);
      const literalRegex = JSON.parse(quoted) as string;
      const { rows } = await db.query<{ matched: boolean; unrelated: boolean }>(
        "select $1 ~* $2 as matched, 'unrelated customer' ~* $2 as unrelated",
        [q, literalRegex],
      );
      assert.deepEqual(rows, [{ matched: true, unrelated: false }], q);
      assert.equal(
        filter
          .slice(`customer_name.imatch.${quoted}`.length)
          .startsWith(",title.imatch."),
        true,
      );
    }
  } finally {
    await db.close();
  }
});

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
    const policiesBefore = await db.query(
      "select policyname,qual,with_check from pg_policies where tablename = 'follow_up_tasks' order by policyname",
    );
    const grantsBefore = await db.query(
      "select grantee,privilege_type from information_schema.role_table_grants where table_name = 'follow_up_tasks' order by grantee,privilege_type",
    );
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/202611110001_follow_up_appointment_types.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    assert.deepEqual(
      (
        await db.query(
          "select distinct appointment_type from public.follow_up_tasks",
        )
      ).rows,
      [{ appointment_type: null }],
    );
    assert.deepEqual(
      (
        await db.query(
          "select policyname,qual,with_check from pg_policies where tablename = 'follow_up_tasks' order by policyname",
        )
      ).rows,
      policiesBefore.rows,
    );
    assert.deepEqual(
      (
        await db.query(
          "select grantee,privilege_type from information_schema.role_table_grants where table_name = 'follow_up_tasks' order by grantee,privilege_type",
        )
      ).rows,
      grantsBefore.rows,
    );
    for (const appointmentType of ["phone", "follow_up", null]) {
      await db.query(
        "update public.follow_up_tasks set appointment_type = $1",
        [appointmentType],
      );
      assert.deepEqual(
        (
          await db.query(
            "select distinct appointment_type from public.follow_up_tasks",
          )
        ).rows,
        [{ appointment_type: appointmentType }],
      );
    }
    await assert.rejects(
      db.query("update public.follow_up_tasks set appointment_type = 'other'"),
      /follow_up_appointment_type_check/,
    );
    const appointmentsBeforeOutcome = await db.query(
      "select id,status,start_time,end_time,appointment_type from public.follow_up_tasks order by id",
    );
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/202611130001_follow_up_outcome.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    assert.deepEqual(
      (
        await db.query(
          "select id,status,start_time,end_time,appointment_type from public.follow_up_tasks order by id",
        )
      ).rows,
      appointmentsBeforeOutcome.rows,
    );
    assert.deepEqual(
      (
        await db.query(
          "select distinct outcome_status from public.follow_up_tasks",
        )
      ).rows,
      [{ outcome_status: null }],
    );
    const ownId = (own.rows[0] as { id: string }).id;
    for (const outcome of ["no_show", "reschedule_requested", "sale", null]) {
      await asUser(B, () =>
        db.query(
          "update public.follow_up_tasks set outcome_status=$1 where id=$2",
          [outcome, ownId],
        ),
      );
      assert.deepEqual(
        (
          await db.query(
            "select outcome_status from public.follow_up_tasks where id=$1",
            [ownId],
          )
        ).rows,
        [{ outcome_status: outcome }],
      );
      assert.deepEqual(
        (
          await db.query(
            "select id,status,start_time,end_time,appointment_type from public.follow_up_tasks order by id",
          )
        ).rows,
        appointmentsBeforeOutcome.rows,
      );
    }
    assert.equal(
      (
        await asUser(A, () =>
          db.query(
            "update public.follow_up_tasks set outcome_status='sale' where id=$1 returning id",
            [ownId],
          ),
        )
      ).rows.length,
      0,
    );
    await assert.rejects(
      db.query("update public.follow_up_tasks set outcome_status='other'"),
      /follow_up_outcome_status_check/,
    );
    assert.deepEqual(
      (
        await db.query(
          "select policyname,qual,with_check from pg_policies where tablename = 'follow_up_tasks' order by policyname",
        )
      ).rows,
      policiesBefore.rows,
    );
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
