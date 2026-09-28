export const categories = [
  "Rechtsschutz",
  "Kfz",
  "Haftpflicht",
  "Hausrat",
  "Wohngebäude",
  "Unfall",
  "Krankenversicherung",
  "Sonstiges",
] as const;
export type Category = (typeof categories)[number];
export type Entry = {
  id: string;
  user_id: string;
  amount: number;
  category: Category;
  occurred_on: string;
  note: string;
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
  partners: Partner[];
};
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
) {
  const relevant = entries.filter((e) => e.occurred_on.startsWith(month));
  const total =
    relevant.reduce((sum, e) => sum + Math.round(e.amount * 100), 0) / 100;
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
    remaining,
    progress: target > 0 ? Math.round((total / target) * 10000) / 100 : 0,
    forecast,
    forecastPercent:
      target > 0 ? Math.round((forecast / target) * 10000) / 100 : 0,
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
