export const categories = [
  "Rechtsschutz",
  "Haftpflicht",
  "Hausrat",
  "Wohngebäude",
  "Unfall",
  "Krankenversicherung",
  "Recht und Heim",
  "Reis Protect 365",
  "Top Schutzbrief",
  "Lebensversicherung",
  "Sonstiges",
] as const;
export type Category = (typeof categories)[number];
// Historical Kfz records stay visible; only categories above can be entered.
export const historicalCategories = [...categories, "Kfz"] as const;
export const transactionTypes = ["Neuvertrag", "Vertragsumstellung"] as const;
export type TransactionType = (typeof transactionTypes)[number];
export type Entry = {
  id: string;
  user_id: string;
  amount: number;
  category: Category | "Kfz";
  transaction_type: TransactionType | null;
  occurred_on: string;
  note: string;
  customer_name: string;
  created_at?: string;
};
export type Cancellation = {
  id: string;
  user_id: string;
  amount: number;
  occurred_on: string;
  reason: string;
  created_at?: string;
};
export type Partner = {
  user_id: string;
  full_name: string;
  total: number;
  target: number;
  entry_count: number;
};
export type DashboardData = {
  userId: string;
  name: string;
  email: string;
  month: string;
  target: number;
  entries: Entry[];
  cancellations: Cancellation[];
  partners: Partner[];
  daily: { date: string; partners: DailyPartner[] };
};
export type DailyPartner = Pick<Partner, "user_id" | "full_name" | "total">;
export function agencyMetrics(partners: Partner[]) {
  const total =
    partners.reduce((s, p) => s + Math.round(p.total * 100), 0) / 100;
  const target =
    partners.reduce((s, p) => s + Math.round(p.target * 100), 0) / 100;
  return {
    total,
    target,
    remaining: Math.max(0, Math.round((target - total) * 100) / 100),
    progress: target > 0 ? Math.max(0, (total / target) * 100) : 0,
  };
}
export function dailyWinners(partners: DailyPartner[]) {
  const highest = Math.max(
    0,
    ...partners.map((p) => Math.round(p.total * 100)),
  );
  return partners
    .filter((p) => highest > 0 && Math.round(p.total * 100) === highest)
    .sort((a, b) => a.full_name.localeCompare(b.full_name, "de"));
}
export function rankDailyPartners(partners: DailyPartner[]) {
  return [...partners].sort(
    (a, b) => b.total - a.total || a.full_name.localeCompare(b.full_name, "de"),
  );
}
export function berlinDate(now = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function currentMonth() {
  return berlinDate().slice(0, 7);
}
export function monthBounds(month: string) {
  const [y, m] = month.split("-").map(Number);
  return {
    start: `${month}-01`,
    end: `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`,
    days: new Date(Date.UTC(y, m, 0)).getUTCDate(),
  };
}
export function calculateMetrics(
  entries: Entry[],
  target: number,
  month: string,
  today = berlinDate(),
  cancellations: Cancellation[] = [],
) {
  const relevant = entries.filter((e) => e.occurred_on.startsWith(month));
  const relevantCancellations = cancellations.filter((c) =>
    c.occurred_on.startsWith(month),
  );
  const gross =
    relevant.reduce((sum, e) => sum + Math.round(e.amount * 100), 0) / 100;
  const storno =
    relevantCancellations.reduce(
      (sum, cancellation) => sum + Math.round(cancellation.amount * 100),
      0,
    ) / 100;
  const total = Math.round((gross - storno) * 100) / 100;
  const { days } = monthBounds(month);
  const elapsed =
    month < today.slice(0, 7)
      ? days
      : month > today.slice(0, 7)
        ? 0
        : Number(today.slice(8));
  const remaining = Math.max(0, Math.round((target - total) * 100) / 100);
  const forecast =
    elapsed > 0 ? Math.round((total / elapsed) * days * 100) / 100 : 0;
  return {
    total,
    gross,
    storno,
    remaining,
    progress:
      target > 0 ? Math.max(0, Math.round((total / target) * 10000) / 100) : 0,
    forecast,
    forecastPercent:
      target > 0
        ? Math.max(0, Math.round((forecast / target) * 10000) / 100)
        : 0,
    dailyNeeded: elapsed < days ? remaining / (days - elapsed) : remaining,
    days,
    elapsed,
    count: relevant.length,
  };
}
export function rankPartners(partners: Partner[]) {
  return [...partners].sort(
    (a, b) => b.total - a.total || a.full_name.localeCompare(b.full_name, "de"),
  );
}
export function teamShareText(
  partners: Partner[],
  month: string,
  demo = false,
) {
  const lines = rankPartners(partners).map(
    (partner, index) =>
      `${index + 1}. ${partner.full_name}: ${number(partner.total, 2)} BWS / Ziel ${number(partner.target, 2)} BWS`,
  );
  return [
    `Goal Track · Unser Team · ${monthLabel(month)}${demo ? " (Beispieldaten)" : ""}`,
    "",
    ...(lines.length ? lines : ["Noch keine Vertriebspartner vorhanden."]),
    "",
    "https://goalcheck.vercel.app",
  ].join("\n");
}
export function dailyShareText(
  partners: DailyPartner[],
  date: string,
  demo = false,
) {
  const day = new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
  const lines = rankDailyPartners(partners).map(
    (partner, index) =>
      `${index + 1}. ${partner.full_name}: ${number(partner.total, 2)} BWS`,
  );
  return [
    `Goal Track · Tagesrangliste · ${day}${demo ? " (Beispieldaten)" : ""}`,
    "",
    ...(lines.length ? lines : ["Noch keine Vertriebspartner vorhanden."]),
    "",
    "Neue Runde täglich ab 00:00 Uhr (Berlin)",
    "https://goalcheck.vercel.app",
  ].join("\n");
}
export const number = (value: number, digits = 0) =>
  new Intl.NumberFormat("de-DE", { maximumFractionDigits: digits }).format(
    value,
  );
export const monthLabel = (month: string) =>
  new Intl.DateTimeFormat("de-DE", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T12:00:00Z`));
export const initials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
