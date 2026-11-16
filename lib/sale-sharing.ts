import type { Entry, DashboardData } from "./metrics";

/** Allocate in integer cents; the remainder belongs to the second partner. */
export function splitBws(total: number, ownPercent: number) {
  const cents = Math.round(total * 100);
  const own = Math.round((cents * ownPercent) / 100);
  return { own: own / 100, partner: (cents - own) / 100 };
}

export function personalEntry(entry: Entry, userId: string): Entry {
  const total = Number(entry.total_amount ?? entry.amount);
  const shares = splitBws(total, Number(entry.owner_percent ?? 100));
  return {
    ...entry,
    total_amount: total,
    amount: entry.partner_id
      ? entry.user_id === userId
        ? shares.own
        : shares.partner
      : total,
  };
}

export function salePartnerOptions(data: DashboardData, demo = false) {
  return (
    data.salePartners ??
    data.partners.map((p) => ({
      id: demo ? demoPartnerKey(p.user_id) : p.user_id,
      full_name: p.full_name,
    }))
  );
}
function demoPartnerKey(id: string) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `00000000-0000-4000-8000-${hash.toString(16).padStart(12, "0")}`;
}
export function applyDemoSale(
  data: DashboardData,
  next: Entry | null,
  previous: Entry | null,
): DashboardData {
  const contribution = (e: Entry | null, id: string) =>
    !e
      ? 0
      : e.user_id === id
        ? personalEntry(e, id).amount
        : e.partner_id === demoPartnerKey(id)
          ? splitBws(e.total_amount ?? e.amount, e.owner_percent ?? 100).partner
          : 0;
  const delta = (id: string, period: string) =>
    Math.round(
      ((next?.occurred_on.startsWith(period) ? contribution(next, id) : 0) -
        (previous?.occurred_on.startsWith(period)
          ? contribution(previous, id)
          : 0)) *
        100,
    ) / 100;
  return {
    ...data,
    entries: [
      ...(next?.occurred_on.startsWith(data.month)
        ? [personalEntry(next, data.userId)]
        : []),
      ...data.entries.filter((e) => e.id !== previous?.id && e.id !== next?.id),
    ].sort((a, b) => b.occurred_on.localeCompare(a.occurred_on)),
    partners: data.partners.map((p) => ({
      ...p,
      total: Math.round((p.total + delta(p.user_id, data.month)) * 100) / 100,
      entry_count:
        p.entry_count +
        (next?.user_id === p.user_id && next.occurred_on.startsWith(data.month)
          ? 1
          : 0) -
        (previous?.user_id === p.user_id &&
        previous.occurred_on.startsWith(data.month)
          ? 1
          : 0),
    })),
    daily: {
      ...data.daily,
      partners: data.daily.partners.map((p) => ({
        ...p,
        total:
          Math.round((p.total + delta(p.user_id, data.daily.date)) * 100) / 100,
      })),
    },
  };
}
