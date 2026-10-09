import {
  currentMonth,
  berlinDate,
  type DashboardData,
  type Entry,
  rankPartners,
  type TransactionType,
} from "./metrics";
export function demoData(month = currentMonth()): DashboardData {
  const demoAmounts = [1250, 480, 1850, 620, 1500, 750, 2000];
  const dayLimit =
    month === currentMonth() ? Number(berlinDate().slice(8)) : 28;
  const entries: Entry[] = demoAmounts
    .map((amount, i) => ({
      id: `demo-${i}`,
      user_id: "demo-you",
      amount,
      category: (
        [
          "Rechtsschutz",
          "Sonstiges",
          "Krankenversicherung",
          "Hausrat",
          "Wohngebäude",
          "Unfall",
          "Krankenversicherung",
        ] as const
      )[i],
      occurred_on: `${month}-${String(Math.max(1, Math.round(((i + 1) * dayLimit) / 8))).padStart(2, "0")}`,
      note: "",
      customer_name: "",
      transaction_type: (i % 2 === 0
        ? "Neuvertrag"
        : "Vertragsumstellung") as TransactionType,
    }))
    .reverse();
  return {
    userId: "demo-you",
    name: "Berin Pretzer",
    email: "Demo-Zugang",
    month,
    target: 10000,
    entries,
    cancellations: [],
    fixedCosts: [],
    daily: {
      date: berlinDate(),
      partners: [
        { user_id: "demo-steven", full_name: "Steven Prell", total: 1250 },
        {
          user_id: "demo-sabina",
          full_name: "Sabina Schlegelmilch",
          total: 750,
        },
        {
          user_id: "demo-you",
          full_name: "Berin Pretzer",
          total: entries
            .filter((e) => e.occurred_on === berlinDate())
            .reduce((s, e) => s + e.amount, 0),
        },
        { user_id: "demo-johannes", full_name: "Johannes Bubb", total: 420 },
        { user_id: "demo-vanessa", full_name: "Vanessa Holzinger", total: 0 },
        { user_id: "demo-alina", full_name: "Alina Wolf", total: 0 },
      ],
    },
    partners: rankPartners([
      {
        user_id: "demo-steven",
        full_name: "Steven Prell",
        total: 12480,
        target: 15000,
        entry_count: 12,
      },
      {
        user_id: "demo-sabina",
        full_name: "Sabina Schlegelmilch",
        total: 10350,
        target: 12000,
        entry_count: 9,
      },
      {
        user_id: "demo-you",
        full_name: "Berin Pretzer",
        total: 8450,
        target: 10000,
        entry_count: 7,
      },
      {
        user_id: "demo-johannes",
        full_name: "Johannes Bubb",
        total: 7200,
        target: 10000,
        entry_count: 8,
      },
      {
        user_id: "demo-vanessa",
        full_name: "Vanessa Holzinger",
        total: 6800,
        target: 10000,
        entry_count: 6,
      },
      {
        user_id: "demo-alina",
        full_name: "Alina Wolf",
        total: 4950,
        target: 8000,
        entry_count: 5,
      },
    ]),
  };
}
