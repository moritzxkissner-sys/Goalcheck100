import test from "node:test";
import assert from "node:assert/strict";
import {
  berlinDate,
  calculateMetrics,
  monthBounds,
  rankPartners,
  type Entry,
} from "../lib/metrics";
import { entrySchema, goalSchema } from "../lib/validation";
const entry = (amount: number, occurred_on = "2026-09-12"): Entry => ({
  id: "280e6fa2-8686-4e6c-9e73-a75022f2bf75",
  user_id: "test",
  category: "Kfz",
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
test("reject invalid amounts, categories, dates, ids and goal months", () => {
  for (const amount of [0, -1, NaN, Infinity, 1.234, 1e10])
    assert.equal(entrySchema.safeParse(entry(amount)).success, false);
  assert.equal(entrySchema.safeParse(entry(10.25)).success, true);
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
