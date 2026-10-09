import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const A = "00000000-0000-4000-8000-000000000001";
const B = "00000000-0000-4000-8000-000000000002";
const C = "00000000-0000-4000-8000-000000000003";
const D = "00000000-0000-4000-8000-000000000004";
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
      `insert into auth.users(id,email,raw_user_meta_data) values ($1,'a@example.test','{"full_name":"Partner A"}'), ($2,'b@example.test','{"full_name":"Partner B"}'), ($3,'c@example.test','{"full_name":"Unapproved","active":true}'), ($4,'d@example.test','{"full_name":"Moritz Kissner"}')`,
      [A, B, C, D],
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
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/202609290001_team_performance.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/202610010001_add_insurance_products.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.query("update public.profiles set active = true where id = $1", [
      D,
    ]);
    await db.query(
      "insert into public.sales_entries(user_id,amount,category,occurred_on) values ($1,99999,'Hausrat','2020-09-14')",
      [D],
    );
    await db.query(
      "insert into public.sales_entries(user_id,amount,category,occurred_on) values ($1,99999,'Hausrat',(now() at time zone 'Europe/Berlin')::date)",
      [D],
    );
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/202610070001_private_customer_names_team_visibility.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/202610070002_cancellation_entries.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/202610090001_private_fixed_costs.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const servicePrivilege = await db.query<{ allowed: boolean }>(
      "select has_table_privilege('service_role','public.fixed_costs','SELECT') as allowed",
    );
    assert.equal(servicePrivilege.rows[0].allowed, false);
    const ownExpense = await asUser(A, () =>
      db.query<{ id: string }>(
        "insert into public.fixed_costs(user_id,name,amount,cadence) values ($1,'Miete',870,'monthly') returning id",
        [A],
      ),
    );
    const expenseId = ownExpense.rows[0].id;
    await asUser(B, () =>
      db.query(
        "insert into public.fixed_costs(user_id,name,amount,cadence) values ($1,'Software',360,'yearly')",
        [B],
      ),
    );
    const expensesForB = await asUser(B, () =>
      db.query<{ user_id: string; name: string }>(
        "select user_id, name from public.fixed_costs",
      ),
    );
    assert.deepEqual(expensesForB.rows, [{ user_id: B, name: "Software" }]);
    assert.equal(
      (
        await asUser(B, () =>
          db.query(
            "update public.fixed_costs set amount = 1 where id = $1 returning id",
            [expenseId],
          ),
        )
      ).rows.length,
      0,
    );
    assert.equal(
      (
        await asUser(B, () =>
          db.query(
            "delete from public.fixed_costs where id = $1 returning id",
            [expenseId],
          ),
        )
      ).rows.length,
      0,
    );
    await assert.rejects(
      asUser(B, () =>
        db.query(
          "insert into public.fixed_costs(user_id,name,amount,cadence) values ($1,'Fremd',1,'monthly')",
          [A],
        ),
      ),
      /row-level security/,
    );
    await assert.rejects(
      asUser(A, () =>
        db.query("update public.fixed_costs set user_id = $1 where id = $2", [
          B,
          expenseId,
        ]),
      ),
      /row-level security/,
    );
    for (const [name, amount, cadence] of [
      ["   ", 1, "monthly"],
      ["Leads", 0, "monthly"],
      ["Leads", 1, "weekly"],
    ]) {
      await assert.rejects(
        asUser(A, () =>
          db.query(
            "insert into public.fixed_costs(user_id,name,amount,cadence) values ($1,$2,$3,$4)",
            [A, name, amount, cadence],
          ),
        ),
        /check constraint/,
      );
    }
    await assert.rejects(
      asUser(C, () =>
        db.query(
          "insert into public.fixed_costs(user_id,name,amount,cadence) values ($1,'Test',1,'monthly')",
          [C],
        ),
      ),
      /row-level security/,
    );
    assert.equal(
      (await asUser(C, () => db.query("select * from public.fixed_costs"))).rows
        .length,
      0,
    );
    const edited = await asUser(A, () =>
      db.query<{ amount: string; cadence: string }>(
        "update public.fixed_costs set amount = 1200, cadence = 'quarterly' where id = $1 returning amount,cadence",
        [expenseId],
      ),
    );
    assert.equal(Number(edited.rows[0].amount), 1200);
    assert.equal(edited.rows[0].cadence, "quarterly");
    assert.equal(
      (
        await asUser(A, () =>
          db.query(
            "delete from public.fixed_costs where id = $1 returning id",
            [expenseId],
          ),
        )
      ).rows.length,
      1,
    );
    const hiddenProfile = await db.query<{
      active: boolean;
      visible_in_team: boolean;
    }>("select active, visible_in_team from public.profiles where id = $1", [
      D,
    ]);
    assert.deepEqual(hiddenProfile.rows[0], {
      active: true,
      visible_in_team: false,
    });
    const hiddenMonthly = await asUser(D, () =>
      db.query<{ user_id: string }>(
        "select * from public.team_leaderboard('2020-09-01')",
      ),
    );
    assert.equal(
      hiddenMonthly.rows.some((row) => row.user_id === D),
      false,
    );
    const hiddenDaily = await asUser(D, () =>
      db.query<{ user_id: string }>(
        "select * from public.team_daily_leaderboard()",
      ),
    );
    assert.equal(
      hiddenDaily.rows.some((row) => row.user_id === D),
      false,
    );
    await asUser(A, () =>
      db.query(
        "insert into public.sales_entries(user_id,amount,category,transaction_type,occurred_on,customer_name) values ($1,1,'Hausrat','Neuvertrag','2020-09-16','Kunde Test')",
        [A],
      ),
    );
    const privateName = await asUser(A, () =>
      db.query<{ customer_name: string }>(
        "select customer_name from public.sales_entries where customer_name <> ''",
      ),
    );
    assert.equal(privateName.rows[0].customer_name, "Kunde Test");
    const otherNames = await asUser(B, () =>
      db.query<{ customer_name: string }>(
        "select customer_name from public.sales_entries where customer_name <> ''",
      ),
    );
    assert.equal(otherNames.rows.length, 0);
    await asUser(A, () =>
      db.query(
        "delete from public.sales_entries where customer_name = 'Kunde Test'",
      ),
    );
    await assert.rejects(
      asUser(D, () =>
        db.query(
          "update public.profiles set visible_in_team = true where id = $1",
          [D],
        ),
      ),
      /permission denied/,
    );
    for (const category of [
      "Recht und Heim",
      "Reis Protect 365",
      "Top Schutzbrief",
      "Lebensversicherung",
    ]) {
      await asUser(A, () =>
        db.query(
          "insert into public.sales_entries(user_id,amount,category,transaction_type,occurred_on) values ($1,1,$2,'Neuvertrag','2020-10-01')",
          [A, category],
        ),
      );
    }
    await asUser(A, () =>
      db.query(
        "delete from public.sales_entries where occurred_on = '2020-10-01'",
      ),
    );
    const legacy = await asUser(A, () =>
      db.query<{ category: string; transaction_type: string | null }>(
        "select category, transaction_type from public.sales_entries where category = 'Kfz'",
      ),
    );
    assert.equal(legacy.rows[0].category, "Kfz");
    assert.equal(legacy.rows[0].transaction_type, null);
    for (const [category, kind] of [
      ["Kfz", "Neuvertrag"],
      ["Hausrat", "invalid"],
      ["Hausrat", null],
    ]) {
      await assert.rejects(
        asUser(A, () =>
          db.query(
            "insert into public.sales_entries(user_id,amount,category,transaction_type,occurred_on) values ($1,1,$2,$3,'2020-09-01')",
            [A, category, kind],
          ),
        ),
        /check constraint/,
      );
    }
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
    assert.equal("customer_name" in team.rows[0], false);
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
          `insert into public.sales_entries(user_id,amount,category,occurred_on) values ($1,1,'Hausrat','2020-09-01')`,
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
          `insert into public.sales_entries(user_id,amount,category,occurred_on) values ($1,1,'Hausrat','2020-09-01')`,
          [C],
        ),
      ),
      /row-level security/,
    );
    await assert.rejects(
      asUser(A, () =>
        db.query(
          `insert into public.sales_entries(user_id,amount,category,occurred_on) values ($1,1,'Hausrat','2099-09-01')`,
          [A],
        ),
      ),
      /check constraint/,
    );
    await assert.rejects(
      asUser(A, () =>
        db.query(
          `insert into public.sales_entries(user_id,amount,category,occurred_on) values ($1,-1,'Hausrat','2020-09-01')`,
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
    type DailyRow = { user_id: string; total: string; day: string };
    const daily = () =>
      asUser(B, () =>
        db.query<DailyRow>("select * from public.team_daily_leaderboard()"),
      );
    assert.ok((await daily()).rows.every((p) => Number(p.total) === 0));
    const todaySql = "(now() at time zone 'Europe/Berlin')::date";
    await asUser(A, () =>
      db.query(
        `insert into public.sales_entries(user_id,amount,category,transaction_type,occurred_on) values ($1,250.25,'Hausrat','Vertragsumstellung',${todaySql})`,
        [A],
      ),
    );
    await asUser(B, () =>
      db.query(
        `insert into public.sales_entries(user_id,amount,category,transaction_type,occurred_on) values ($1,125.10,'Unfall','Neuvertrag',${todaySql}), ($1,9999,'Hausrat','Neuvertrag',${todaySql} - 1)`,
        [B],
      ),
    );
    // An inactive member's sales must never influence either aggregate.
    await db.query(
      `insert into public.sales_entries(user_id,amount,category,occurred_on) values ($1,999999,'Hausrat',${todaySql})`,
      [C],
    );
    const firstDaily = (await daily()).rows;
    assert.equal(firstDaily.length, 2);
    assert.equal(firstDaily[0].user_id, A);
    assert.equal(Number(firstDaily[0].total), 250.25);
    assert.equal(Number(firstDaily[1].total), 125.1);
    assert.deepEqual(Object.keys(firstDaily[0]).sort(), [
      "day",
      "full_name",
      "total",
      "user_id",
    ]);
    const typed = await asUser(A, () =>
      db.query<{ transaction_type: string }>(
        `select transaction_type from public.sales_entries where occurred_on = ${todaySql}`,
      ),
    );
    assert.equal(typed.rows[0].transaction_type, "Vertragsumstellung");
    const monthly = () =>
      asUser(B, () =>
        db.query<{ total: string; target: string }>(
          `select * from public.team_leaderboard(date_trunc('month', ${todaySql})::date)`,
        ),
      );
    const beforeGlobal = (await monthly()).rows;
    const sum = (rows: { total: string }[]) =>
      rows.reduce((s, p) => s + Math.round(Number(p.total) * 100), 0) / 100;
    // Another user's write updates the agency numerator and creates a daily tie.
    await asUser(B, () =>
      db.query(
        `insert into public.sales_entries(user_id,amount,category,transaction_type,occurred_on) values ($1,125.15,'Rechtsschutz','Vertragsumstellung',${todaySql})`,
        [B],
      ),
    );
    assert.equal(
      Math.round((sum((await monthly()).rows) - sum(beforeGlobal)) * 100),
      12515,
    );
    assert.ok((await daily()).rows.every((p) => Number(p.total) === 250.25));
    await asUser(A, () =>
      db.query(
        `insert into public.monthly_goals(user_id,month,target) values ($1,date_trunc('month', ${todaySql})::date,20000) on conflict (user_id,month) do update set target = excluded.target`,
        [A],
      ),
    );
    assert.equal(
      (await monthly()).rows.reduce((s, p) => s + Number(p.target), 0),
      30000,
    );
    await asUser(A, () =>
      db.query(
        `delete from public.sales_entries where occurred_on = ${todaySql}`,
      ),
    );
    assert.equal((await daily()).rows[0].user_id, B);
    await asUser(B, () =>
      db.query(
        `delete from public.sales_entries where occurred_on = ${todaySql}`,
      ),
    );
    // Yesterday's larger sale is still stored, but the daily ranking is empty.
    assert.ok((await daily()).rows.every((p) => Number(p.total) === 0));
    // A later Storno belongs to its booking month and never mutates an old sale.
    const oldSalesBefore = await asUser(A, () =>
      db.query<{ id: string }>(
        "select id from public.sales_entries order by id",
      ),
    );
    const cancellation = await asUser(A, () =>
      db.query<{ id: string }>(
        "insert into public.cancellation_entries(user_id,amount,occurred_on,reason) values ($1,600,'2020-09-30','Testwiderruf') returning id",
        [A],
      ),
    );
    const cancellationId = cancellation.rows[0].id;
    const septemberNet = await asUser(B, () =>
      db.query<{ user_id: string; total: string; entry_count: number }>(
        "select * from public.team_leaderboard('2020-09-01')",
      ),
    );
    assert.equal(
      Number(septemberNet.rows.find((r) => r.user_id === A)?.total),
      -600,
    );
    assert.equal(
      septemberNet.rows.find((r) => r.user_id === A)?.entry_count,
      0,
    );
    assert.deepEqual(
      (
        await asUser(A, () =>
          db.query<{ id: string }>(
            "select id from public.sales_entries order by id",
          ),
        )
      ).rows,
      oldSalesBefore.rows,
    );
    assert.equal(
      (
        await asUser(B, () =>
          db.query("select * from public.cancellation_entries"),
        )
      ).rows.length,
      0,
    );
    assert.equal(
      (
        await asUser(A, () =>
          db.query<{ reason: string }>(
            "select reason from public.cancellation_entries",
          ),
        )
      ).rows[0].reason,
      "Testwiderruf",
    );
    await assert.rejects(
      asUser(B, () =>
        db.query(
          "insert into public.cancellation_entries(user_id,amount,occurred_on) values ($1,10,'2020-09-30')",
          [A],
        ),
      ),
      /row-level security/,
    );
    for (const [amount, bookingDay] of [
      [0, "2020-09-30"],
      [1, "2099-09-30"],
    ] as const) {
      await assert.rejects(
        asUser(A, () =>
          db.query(
            "insert into public.cancellation_entries(user_id,amount,occurred_on) values ($1,$2,$3)",
            [A, amount, bookingDay],
          ),
        ),
        /check constraint/,
      );
    }
    const deletedByOther = await asUser(B, () =>
      db.query(
        "delete from public.cancellation_entries where id = $1 returning id",
        [cancellationId],
      ),
    );
    assert.equal(deletedByOther.rows.length, 0);
    await asUser(A, () =>
      db.query(
        `insert into public.cancellation_entries(user_id,amount,occurred_on) values ($1,75,${todaySql})`,
        [A],
      ),
    );
    const netDaily = (await daily()).rows;
    assert.equal(netDaily[0].user_id, B);
    assert.equal(Number(netDaily.find((r) => r.user_id === A)?.total), -75);
    await asUser(B, () =>
      db.query(
        `insert into public.cancellation_entries(user_id,amount,occurred_on) values ($1,100,${todaySql} - 1)`,
        [B],
      ),
    );
    assert.equal(
      Number((await daily()).rows.find((r) => r.user_id === B)?.total),
      0,
    );
    await db.query(
      `insert into public.cancellation_entries(user_id,amount,occurred_on) values ($1,999999,${todaySql})`,
      [D],
    );
    assert.equal((await daily()).rows.length, 2);
    await asUser(A, () =>
      db.query(
        `delete from public.cancellation_entries where occurred_on = ${todaySql}`,
      ),
    );
    assert.ok((await daily()).rows.every((p) => Number(p.total) === 0));
    await assert.rejects(
      asUser(C, () =>
        db.query(
          `insert into public.cancellation_entries(user_id,amount,occurred_on) values ($1,10,${todaySql})`,
          [C],
        ),
      ),
      /row-level security/,
    );
    await assert.rejects(
      asUser(C, () =>
        db.query("select * from public.team_daily_leaderboard()"),
      ),
      /membership required/,
    );
    await db.query("update public.profiles set active = false where id = $1", [
      B,
    ]);
    const revoked = await asUser(B, () =>
      db.query("select * from public.sales_entries"),
    );
    assert.equal(revoked.rows.length, 0);
    await assert.rejects(daily(), /membership required/);
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
    await db.exec("begin; set local role anon;");
    try {
      await assert.rejects(
        db.query("select * from public.team_daily_leaderboard()"),
        /permission denied/,
      );
    } finally {
      await db.exec("rollback");
    }
  } finally {
    await db.close();
  }
});
