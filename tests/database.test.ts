import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const A = "00000000-0000-4000-8000-000000000001";
const B = "00000000-0000-4000-8000-000000000002";
const C = "00000000-0000-4000-8000-000000000003";
test("migration enforces private logs and live team aggregates", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema public, auth to authenticated, anon;
      grant execute on function auth.uid() to authenticated, anon;`);
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/202609280001_goal_track.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.query(
      `insert into auth.users(id,email,raw_user_meta_data) values ($1,'a@example.test','{"full_name":"Partner A"}'), ($2,'b@example.test','{"full_name":"Partner B"}'), ($3,'c@example.test','{"full_name":"Unapproved","active":true}')`,
      [A, B, C],
    );
    await db.query(
      `update public.profiles set active = true where id in ($1,$2)`,
      [A, B],
    );
    async function asUser<T>(id: string, operation: () => Promise<T>) {
      await db.exec("begin; set local role authenticated;");
      await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [
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
    await asUser(A, () =>
      db.query(
        `insert into public.sales_entries(user_id,amount,category,occurred_on,note) values ($1,1250.25,'Kfz','2020-09-14','Private A note')`,
        [A],
      ),
    );
    await asUser(B, () =>
      db.query(
        `insert into public.sales_entries(user_id,amount,category,occurred_on) values ($1,500,'Hausrat','2020-09-15')`,
        [B],
      ),
    );
    await asUser(A, () =>
      db.query(
        `insert into public.sales_entries(user_id,amount,category,occurred_on) values ($1,999,'Unfall','2020-08-01')`,
        [A],
      ),
    );
    const own = await asUser(B, () =>
      db.query<{ user_id: string }>("select * from public.sales_entries"),
    );
    assert.equal(own.rows.length, 1);
    assert.equal(own.rows[0].user_id, B);
    const team = await asUser(B, () =>
      db.query<{ full_name: string; total: string; entry_count: number }>(
        `select * from public.team_leaderboard('2020-09-01')`,
      ),
    );
    assert.equal(team.rows.length, 2);
    assert.equal(team.rows[0].full_name, "Partner A");
    assert.equal(Number(team.rows[0].total), 1250.25);
    assert.equal(Number(team.rows[0].entry_count), 1);
    assert.equal("note" in team.rows[0], false);
    await asUser(A, () =>
      db.query(
        `insert into public.monthly_goals(user_id,month,target) values ($1,'2020-09-01',2500)`,
        [A],
      ),
    );
    const goal = await asUser(B, () =>
      db.query<{ target: string }>(
        `select target from public.team_leaderboard('2020-09-01') where user_id = $1`,
        [A],
      ),
    );
    assert.equal(Number(goal.rows[0].target), 2500);
    await assert.rejects(
      asUser(B, () =>
        db.query(
          `insert into public.sales_entries(user_id,amount,category,occurred_on) values ($1,1,'Kfz','2020-09-01')`,
          [A],
        ),
      ),
      /row-level security/,
    );
    await assert.rejects(
      asUser(B, () =>
        db.query(`update public.profiles set active = true where id = $1`, [C]),
      ),
      /permission denied/,
    );
    await assert.rejects(
      asUser(C, () =>
        db.query(`select * from public.team_leaderboard('2020-09-01')`),
      ),
      /membership required/,
    );
    await assert.rejects(
      asUser(C, () =>
        db.query(
          `insert into public.sales_entries(user_id,amount,category,occurred_on) values ($1,1,'Kfz','2020-09-01')`,
          [C],
        ),
      ),
      /row-level security/,
    );
    await assert.rejects(
      asUser(A, () =>
        db.query(
          `insert into public.sales_entries(user_id,amount,category,occurred_on) values ($1,1,'Kfz','2099-09-01')`,
          [A],
        ),
      ),
      /check constraint/,
    );
    await assert.rejects(
      asUser(A, () =>
        db.query(
          `insert into public.sales_entries(user_id,amount,category,occurred_on) values ($1,-1,'Kfz','2020-09-01')`,
          [A],
        ),
      ),
      /check constraint/,
    );
    await asUser(B, () =>
      db.query(`delete from public.sales_entries where user_id = $1`, [A]),
    );
    const untouched = await asUser(A, () =>
      db.query("select * from public.sales_entries"),
    );
    assert.equal(untouched.rows.length, 2);
    await asUser(A, () =>
      db.query(
        `delete from public.sales_entries where occurred_on = '2020-09-14'`,
      ),
    );
    const after = await asUser(B, () =>
      db.query<{ full_name: string; total: string }>(
        `select * from public.team_leaderboard('2020-09-01')`,
      ),
    );
    assert.equal(after.rows[0].full_name, "Partner B");
    assert.equal(Number(after.rows[1].total), 0);
    await db.query("update public.profiles set active = false where id = $1", [
      B,
    ]);
    const revoked = await asUser(B, () =>
      db.query("select * from public.sales_entries"),
    );
    assert.equal(revoked.rows.length, 0);
    await assert.rejects(
      asUser(B, () =>
        db.query(`select * from public.team_leaderboard('2020-09-01')`),
      ),
      /membership required/,
    );
    await db.exec("begin; set local role anon;");
    try {
      await assert.rejects(
        db.query(`select * from public.team_leaderboard('2020-09-01')`),
        /permission denied/,
      );
    } finally {
      await db.exec("rollback");
    }
  } finally {
    await db.close();
  }
});
