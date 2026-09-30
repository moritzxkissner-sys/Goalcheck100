import test from "node:test";
import assert from "node:assert/strict";
import {
  berlinDate,
  agencyMetrics,
  dailyWinners,
  rankDailyPartners,
  euro,
  calculateMetrics,
  monthBounds,
  rankPartners,
  teamShareText,
  type Entry,
} from "../lib/metrics";
import { entrySchema, goalSchema } from "../lib/validation";
const entry = (amount: number, occurred_on = "2026-09-12"): Entry => ({
  id: "280e6fa2-8686-4e6c-9e73-a75022f2bf75",
  user_id: "test",
  category: "Rechtsschutz",
  transaction_type: "Neuvertrag",
  amount,
  occurred_on,
  note: "",
});
test("sales update total, remaining target, progress and forecast", () => {
  const before = calculateMetrics([], 10000, "2026-09", "2026-09-15");
  const after = calculateMetrics([entry(2500)], 10000, "2026-09", "2026-09-15");
  assert.equal(before.total, 0);
  assert.equal(after.total, 2500);
  assert.equal(after.remaining, 7500);
  assert.equal(after.progress, 25);
  assert.equal(after.forecast, 5000);
  assert.equal(after.forecastPercent, 50);
  assert.equal(after.dailyNeeded, 500);
});
test("month isolation, decimal precision, and exceeded goals", () => {
  const m = calculateMetrics(
    [entry(0.1), entry(0.2), entry(20000, "2026-08-10")],
    0.2,
    "2026-09",
    "2026-09-30",
  );
  assert.equal(m.total, 0.3);
  assert.equal(m.remaining, 0);
  assert.equal(m.progress, 150);
  assert.equal(m.forecast, 0.3);
});
test("leap years, year rollover, past and future months", () => {
  assert.equal(monthBounds("2028-02").days, 29);
  assert.equal(monthBounds("2026-12").end, "2027-01-01");
  assert.equal(
    calculateMetrics([entry(50)], 100, "2026-09", "2026-10-01").forecast,
    50,
  );
  assert.equal(calculateMetrics([], 100, "2026-12", "2026-09-01").forecast, 0);
  assert.equal(berlinDate(new Date("2026-09-30T22:30:00Z")), "2026-10-01");
});
test("leaderboard reorders after personal BWS changes", () => {
  const team = [
    { user_id: "a", full_name: "A", total: 100, target: 1000, entry_count: 1 },
    { user_id: "b", full_name: "B", total: 300, target: 1000, entry_count: 1 },
  ];
  assert.equal(rankPartners(team)[0].user_id, "b");
  team[0].total += 250;
  assert.equal(rankPartners(team)[0].user_id, "a");
});
test("team share summary follows ranking and includes goals and production link", () => {
  const team = [
    {
      user_id: "a",
      full_name: "Anna",
      total: 1200,
      target: 3000,
      entry_count: 1,
    },
    {
      user_id: "b",
      full_name: "Max",
      total: 4500,
      target: 5000,
      entry_count: 2,
    },
  ];
  const summary = teamShareText(team, "2026-09");
  assert.match(summary, /1\. Max: 4\.500 BWS \/ Ziel 5\.000 BWS/);
  assert.match(summary, /2\. Anna: 1\.200 BWS \/ Ziel 3\.000 BWS/);
  assert.match(summary, /https:\/\/goalcheck\.vercel\.app/);
  team[0].total = 6000;
  assert.match(teamShareText(team, "2026-09"), /1\. Anna: 6\.000 BWS/);
});
test("reject invalid amounts, categories, dates, ids and goal months", () => {
  for (const amount of [0, -1, NaN, Infinity, 1.234, 1e10])
    assert.equal(entrySchema.safeParse(entry(amount)).success, false);
  assert.equal(entrySchema.safeParse(entry(10.25)).success, true);
  assert.equal(
    entrySchema.safeParse({ ...entry(10), category: "Kfz" }).success,
    false,
  );
  for (const transaction_type of [null, undefined, "Other", ""]) {
    assert.equal(
      entrySchema.safeParse({ ...entry(10), transaction_type }).success,
      false,
    );
  }
  assert.equal(
    entrySchema.safeParse({
      ...entry(10),
      transaction_type: "Vertragsumstellung",
    }).success,
    true,
  );
  assert.equal(
    entrySchema.safeParse({ ...entry(10), occurred_on: "2026-02-30" }).success,
    false,
  );
  assert.equal(
    entrySchema.safeParse({ ...entry(10), category: "Other" }).success,
    false,
  );
  assert.equal(
    entrySchema.safeParse({ ...entry(10), id: "bad" }).success,
    false,
  );
  assert.equal(
    goalSchema.safeParse({ month: "2026-13", target: 100 }).success,
    false,
  );
  assert.equal(
    goalSchema.safeParse({ month: "2026-09", target: 10000 }).success,
    true,
  );
});

test("agency totals include targets, exact cents and overachievement", () => {
  const p = { user_id: "a", full_name: "A", entry_count: 1 };
  assert.deepEqual(agencyMetrics([]), {
    total: 0,
    target: 0,
    remaining: 0,
    progress: 0,
  });
  const result = agencyMetrics([
    { ...p, total: 0.1, target: 0.1 },
    { ...p, total: 0.2, target: 0.1 },
  ]);
  assert.equal(result.total, 0.3);
  assert.equal(result.target, 0.2);
  assert.equal(result.remaining, 0);
  assert.ok(Math.abs(result.progress - 150) < 0.00001);
});

test("daily winner handles no sales, ties and reversals", () => {
  const a = { user_id: "a", full_name: "A", total: 0 };
  const b = { user_id: "b", full_name: "B", total: 0 };
  assert.deepEqual(dailyWinners([]), []);
  assert.deepEqual(dailyWinners([a, b]), []);
  assert.deepEqual(
    dailyWinners([
      { ...a, total: 100 },
      { ...b, total: 100 },
    ]).map((p) => p.user_id),
    ["a", "b"],
  );
  assert.equal(dailyWinners([a, { ...b, total: 50 }])[0].user_id, "b");
});

test("daily earnings sort by BWS and format one BWS as one euro", () => {
  const daily = [
    { user_id: "b", full_name: "B", total: 0 },
    { user_id: "a", full_name: "A", total: 1250.5 },
  ];
  assert.deepEqual(
    rankDailyPartners(daily).map((p) => p.user_id),
    ["a", "b"],
  );
  assert.equal(euro(daily[1].total), "1.250,50 €");
  assert.deepEqual(
    daily.map((p) => p.user_id),
    ["b", "a"],
  );
});

test("Berlin day switches at local midnight in summer, winter and DST", () => {
  for (const [before, after, date] of [
    ["2026-09-30T21:59:59Z", "2026-09-30T22:00:00Z", "2026-10-01"],
    ["2026-12-31T22:59:59Z", "2026-12-31T23:00:00Z", "2027-01-01"],
    ["2026-03-29T21:59:59Z", "2026-03-29T22:00:00Z", "2026-03-30"],
  ]) {
    assert.notEqual(berlinDate(new Date(before)), date);
    assert.equal(berlinDate(new Date(after)), date);
  }
});
