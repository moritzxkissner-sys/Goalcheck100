import test from "node:test";
import assert from "node:assert/strict";
import {
  fixedCostBwsComparison,
  fixedCostShares,
  monthlyFixedCost,
  totalMonthlyFixedCosts,
  type FixedCost,
} from "../lib/fixed-costs";

const cost = (
  name: string,
  amount: number,
  cadence: FixedCost["cadence"],
): FixedCost => ({
  id: name,
  user_id: "owner",
  name,
  amount,
  cadence,
});

test("monthly equivalents divide quarterly and yearly payments, rounding per item", () => {
  assert.equal(monthlyFixedCost(cost("Miete", 870, "monthly")), 870);
  assert.equal(monthlyFixedCost(cost("Software", 100, "quarterly")), 33.33);
  assert.equal(monthlyFixedCost(cost("Versicherung", 100, "yearly")), 8.33);
  assert.equal(
    totalMonthlyFixedCosts([
      cost("Miete", 870, "monthly"),
      cost("Software", 100, "quarterly"),
      cost("Versicherung", 100, "yearly"),
    ]),
    911.66,
  );
});

test("donut shares group identical names and sum to 100 percent", () => {
  const shares = fixedCostShares([
    cost("Leads", 100, "monthly"),
    cost("Leads", 300, "quarterly"),
    cost("Miete", 200, "monthly"),
  ]);
  assert.deepEqual(
    shares.map(({ name, monthlyAmount }) => ({ name, monthlyAmount })),
    [
      { name: "Leads", monthlyAmount: 200 },
      { name: "Miete", monthlyAmount: 200 },
    ],
  );
  assert.equal(
    shares.reduce((sum, share) => sum + share.percent, 0),
    100,
  );
  assert.deepEqual(fixedCostShares([]), []);
});

test("BWS orientation compares values without presenting BWS as EUR", () => {
  const normal = fixedCostBwsComparison(2000, 500);
  assert.equal(normal.percent, 25);
  assert.equal(normal.comparisonReached, false);
  const exceeded = fixedCostBwsComparison(1000, 1499);
  assert.equal(exceeded.percent, 149.9);
  assert.equal(exceeded.visualPercent, 100);
  assert.equal(exceeded.comparisonReached, true);
  const negative = fixedCostBwsComparison(1000, -100);
  assert.equal(negative.visualPercent, 0);
  assert.equal(fixedCostBwsComparison(0, 0).visualPercent, 0);
});
