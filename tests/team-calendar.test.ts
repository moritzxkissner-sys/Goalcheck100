import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  filterCalendarMembers,
  isCalendarMemberName,
} from "../lib/team-calendar";

const ids = Array.from(
  { length: 10 },
  (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
);

test("calendar member filter includes Alina and the corrected partner name", () => {
  for (const name of ["Alina Dalga", "ALINA DALGAR"]) {
    assert.equal(isCalendarMemberName(name), true, name);
  }
  for (const name of [
    "Moritz Kissner",
    "Yuliia Solianyk",
    "Lilli Fischer",
    "Lilly Fischer",
  ]) {
    assert.equal(isCalendarMemberName(name), true, name);
  }
  assert.deepEqual(
    filterCalendarMembers([
      { id: ids[0], full_name: "Steven Prell" },
      { id: ids[1], full_name: "Moritz Kissner" },
      { id: ids[2], full_name: "Yuliia Solianyk" },
    ]).map(({ full_name }) => full_name),
    ["Steven Prell", "Moritz Kissner", "Yuliia Solianyk"],
  );
});

test("calendar migration enforces active team visibility and delegated insert rights", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth;
      create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
      $$;
      grant usage on schema public, auth to authenticated, anon;
      grant execute on function auth.uid() to authenticated, anon;`);
    for (const file of [
      "202609280001_goal_track.sql",
      "202610120001_team_calendar.sql",
      "202610140001_calendar_roster.sql",
    ]) {
      await db.exec(
        await readFile(
          new URL(`../supabase/migrations/${file}`, import.meta.url),
          "utf8",
        ),
      );
    }

    const names = [
      "Steven Prell",
      "Berin Pretzer",
      "Vanessa Holzinger",
      "Julia Soljanik",
      "Sameena Schlegelmilch",
      "Johannes Bubb",
      "Moritz Kissner",
      "Alina Dalgar",
      "Lilly Fischer",
      "Inactive Partner",
    ];
    for (let index = 0; index < names.length; index++) {
      await db.query(
        `insert into auth.users(id,email,raw_user_meta_data)
         values ($1,$2,jsonb_build_object('full_name',$3::text))`,
        [ids[index], `partner${index}@example.test`, names[index]],
      );
    }
    await db.query("update public.profiles set active = true where id <> $1", [
      ids[9],
    ]);
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/202610210001_calendar_partner_permissions.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const correctedNames = await db.query<{ full_name: string }>(
      "select full_name from public.profiles where id in ($1, $2) order by full_name",
      [ids[3], ids[7]],
    );
    assert.deepEqual(
      correctedNames.rows.map((row) => row.full_name),
      ["Alina Dalga", "Yuliia Solianyk"],
    );

    async function asUser<T>(id: string, operation: () => Promise<T>) {
      await db.exec("begin; set local role authenticated;");
      await db.query("select set_config('request.jwt.claim.sub', $1, true)", [
        id,
      ]);
      try {
        const result = await operation();
        await db.exec("commit");
        return result;
      } catch (error) {
        await db.exec("rollback");
        throw error;
      }
    }

    const members = await asUser(ids[0], () =>
      db.query<{ id: string; full_name: string }>(
        "select * from public.team_calendar_members()",
      ),
    );
    assert.deepEqual(
      members.rows.map(({ full_name }) => full_name).sort(),
      [
        "Steven Prell",
        "Berin Pretzer",
        "Vanessa Holzinger",
        "Yuliia Solianyk",
        "Sameena Schlegelmilch",
        "Johannes Bubb",
        "Moritz Kissner",
        "Alina Dalga",
        "Lilli Fischer",
      ].sort(),
    );
    assert.equal(
      members.rows.length,
      9,
      "linked members must not receive duplicate placeholder rows",
    );

    await db.query(
      "update public.profiles set active = false where id in ($1, $2)",
      [ids[3], ids[8]],
    );
    const standbyMembers = await asUser(ids[0], () =>
      db.query<{ id: string; full_name: string }>(
        "select * from public.team_calendar_members()",
      ),
    );
    for (const name of ["Yuliia Solianyk", "Lilli Fischer"]) {
      assert.equal(
        standbyMembers.rows.filter((member) => member.full_name === name)
          .length,
        1,
      );
    }
    assert.equal(
      standbyMembers.rows.some(
        (member) => member.id === ids[3] || member.id === ids[8],
      ),
      false,
      "inactive accounts must not be exposed as linked members",
    );
    await db.query(
      "update public.profiles set active = true where id in ($1, $2)",
      [ids[3], ids[8]],
    );

    const first = await asUser(ids[0], () =>
      db.query<{ id: string }>(
        `insert into public.team_calendar_entries
         (user_id,starts_on,ends_on,reason,comment)
         values ($1,'2026-10-14','2026-10-16','Urlaub','Privater Termin') returning id`,
        [ids[0]],
      ),
    );
    const eventId = first.rows[0].id;
    const readByOther = await asUser(ids[1], () =>
      db.query<{ user_id: string; reason: string }>(
        "select user_id,reason from public.team_calendar_entries",
      ),
    );
    assert.deepEqual(readByOther.rows, [{ user_id: ids[0], reason: "Urlaub" }]);

    await assert.rejects(
      asUser(ids[1], () =>
        db.query(
          `insert into public.team_calendar_entries(user_id,starts_on,ends_on,reason)
           values ($1,'2026-10-14','2026-10-15','Homeoffice')`,
          [ids[0]],
        ),
      ),
      /row-level security/,
    );
    await assert.rejects(
      asUser(ids[1], () =>
        db.query(
          "update public.profiles set can_manage_team_calendar = true where id = $1",
          [ids[1]],
        ),
      ),
      /permission denied/,
    );
    await db.query(
      "update public.profiles set can_manage_team_calendar = true where id = $1",
      [ids[0]],
    );
    const delegated = await asUser(ids[0], () =>
      db.query<{ id: string }>(
        "insert into public.team_calendar_entries(user_id,starts_on,ends_on,reason) values ($1,'2026-10-17','2026-10-17','Homeoffice') returning id",
        [ids[1]],
      ),
    );
    assert.equal(delegated.rows.length, 1);
    await assert.rejects(
      asUser(ids[0], () =>
        db.query(
          "insert into public.team_calendar_entries(user_id,starts_on,ends_on,reason) values ($1,'2026-10-17','2026-10-17','Urlaub')",
          [ids[9]],
        ),
      ),
      /row-level security/,
    );
    await assert.rejects(
      asUser(ids[0], () =>
        db.query(
          "insert into public.team_calendar_entries(user_id,starts_on,ends_on,reason) values ($1,'2026-10-17','2026-10-17','Urlaub')",
          ["85f5c2d0-96a8-5db7-98a2-004020261014"],
        ),
      ),
      /row-level security/,
    );
    assert.equal(
      (
        await asUser(ids[0], () =>
          db.query<{ allowed: boolean }>(
            "select public.can_manage_team_calendar() as allowed",
          ),
        )
      ).rows[0].allowed,
      true,
    );
    assert.equal(
      (
        await asUser(ids[1], () =>
          db.query(
            "update public.team_calendar_entries set reason = 'Krankheit' where id = $1 returning id",
            [eventId],
          ),
        )
      ).rows.length,
      0,
    );
    assert.equal(
      (
        await asUser(ids[1], () =>
          db.query(
            "delete from public.team_calendar_entries where id = $1 returning id",
            [eventId],
          ),
        )
      ).rows.length,
      0,
    );
    await assert.rejects(
      asUser(ids[0], () =>
        db.query(
          "update public.team_calendar_entries set user_id = $1 where id = $2",
          [ids[1], eventId],
        ),
      ),
      /row-level security/,
    );

    for (const [from, to, reason] of [
      ["2026-10-20", "2026-10-19", "Urlaub"],
      ["2026-10-20", "2026-10-21", "Nicht erlaubt"],
      ["1999-01-01", "1999-01-02", "Urlaub"],
    ]) {
      await assert.rejects(
        asUser(ids[0], () =>
          db.query(
            "insert into public.team_calendar_entries(user_id,starts_on,ends_on,reason) values ($1,$2,$3,$4)",
            [ids[0], from, to, reason],
          ),
        ),
        /check constraint/,
      );
    }

    const moritzEntry = await asUser(ids[6], () =>
      db.query<{ id: string }>(
        "insert into public.team_calendar_entries(user_id,starts_on,ends_on,reason) values ($1,'2026-10-15','2026-10-15','Urlaub') returning id",
        [ids[6]],
      ),
    );
    assert.equal(moritzEntry.rows.length, 1);
    const lilliEntry = await asUser(ids[8], () =>
      db.query<{ id: string }>(
        "insert into public.team_calendar_entries(user_id,starts_on,ends_on,reason) values ($1,'2026-10-15','2026-10-15','Homeoffice') returning id",
        [ids[8]],
      ),
    );
    assert.equal(lilliEntry.rows.length, 1);
    await assert.rejects(
      asUser(ids[9], () =>
        db.query("select * from public.team_calendar_members()"),
      ),
      /membership required/,
    );
    assert.equal(
      (
        await asUser(ids[9], () =>
          db.query("select * from public.team_calendar_entries"),
        )
      ).rows.length,
      0,
    );
    await assert.rejects(
      asUser(ids[9], () =>
        db.query(
          "insert into public.team_calendar_entries(user_id,starts_on,ends_on,reason) values ($1,'2026-10-15','2026-10-15','Urlaub')",
          [ids[9]],
        ),
      ),
      /row-level security/,
    );

    await db.exec("begin; set local role anon;");
    try {
      await assert.rejects(
        db.query("select * from public.team_calendar_entries"),
        /permission denied/,
      );
    } finally {
      await db.exec("rollback");
    }
    await db.exec("begin; set local role anon;");
    try {
      await assert.rejects(
        db.query("select * from public.team_calendar_members()"),
        /permission denied/,
      );
    } finally {
      await db.exec("rollback");
    }
    const serviceRead = await db.query<{ allowed: boolean }>(
      "select has_table_privilege('service_role','public.team_calendar_entries','SELECT') as allowed",
    );
    assert.equal(serviceRead.rows[0].allowed, false);

    await asUser(ids[0], () =>
      db.query(
        "update public.team_calendar_entries set reason = 'Weiterbildung' where id = $1",
        [eventId],
      ),
    );
    assert.equal(
      (
        await asUser(ids[0], () =>
          db.query(
            "delete from public.team_calendar_entries where id = $1 returning id",
            [eventId],
          ),
        )
      ).rows.length,
      1,
    );
  } finally {
    await db.close();
  }
});
