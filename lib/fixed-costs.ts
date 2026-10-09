export const fixedCostCadences = ["monthly", "quarterly", "yearly"] as const;

export type Cadence = (typeof fixedCostCadences)[number];

export type FixedCost = {
  id: string;
  user_id: string;
  name: string;
  amount: number;
  cadence: Cadence;
  created_at?: string;
};

const cents = (amount: number) => Math.round(amount * 100);

/** The amount allocated to one month, rounded to a payable cent per item. */
export function monthlyFixedCost(cost: Pick<FixedCost, "amount" | "cadence">) {
  const divisor =
    cost.cadence === "yearly" ? 12 : cost.cadence === "quarterly" ? 3 : 1;
  return Math.round(cents(cost.amount) / divisor) / 100;
}

export function totalMonthlyFixedCosts(
  costs: Pick<FixedCost, "amount" | "cadence">[],
) {
  return (
    costs.reduce((sum, cost) => sum + cents(monthlyFixedCost(cost)), 0) / 100
  );
}

/** Donut slices group repeated names without exposing another user's data. */
export function fixedCostShares(
  costs: Pick<FixedCost, "name" | "amount" | "cadence">[],
) {
  const byName = new Map<string, number>();
  for (const cost of costs) {
    const name = cost.name.trim();
    byName.set(name, (byName.get(name) ?? 0) + cents(monthlyFixedCost(cost)));
  }
  const totalCents = [...byName.values()].reduce(
    (sum, value) => sum + value,
    0,
  );
  return [...byName.entries()]
    .map(([name, amountCents]) => ({
      name,
      monthlyAmount: amountCents / 100,
      percent: totalCents > 0 ? (amountCents / totalCents) * 100 : 0,
    }))
    .sort(
      (a, b) =>
        b.monthlyAmount - a.monthlyAmount || a.name.localeCompare(b.name, "de"),
    );
}

/** Numeric orientation only: BWS is not EUR commission or actual cost coverage. */
export function fixedCostBwsComparison(
  monthlyCostEUR: number,
  monthlyBws: number,
) {
  const percent = monthlyCostEUR > 0 ? (monthlyBws / monthlyCostEUR) * 100 : 0;
  return {
    comparisonReached: monthlyCostEUR > 0 && monthlyBws >= monthlyCostEUR,
    percent,
    visualPercent: Math.min(100, Math.max(0, percent)),
  };
}
