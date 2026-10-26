export type FollowUpStatus = "pending" | "completed" | "rescheduled";

export type FollowUpTask = {
  id: string;
  owner_id: string;
  assigned_to: string;
  title: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  offer_subject: string;
  start_time: string;
  end_time: string;
  status: FollowUpStatus;
  notes: string;
  created_at: string;
  updated_at: string;
};

const timestamp =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const berlinDay = new Intl.DateTimeFormat("sv-SE", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "Europe/Berlin",
});
const berlinClock = new Intl.DateTimeFormat("en-GB", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "Europe/Berlin",
});

export function isoToBerlinLocal(iso: string) {
  const parts = berlinClock.formatToParts(new Date(iso));
  const part = (type: string) =>
    parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

export function berlinLocalToIso(local: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null;
  const wall = new Date(`${local}:00Z`).getTime();
  if (!Number.isFinite(wall)) return null;
  for (const offset of [1, 2]) {
    const candidate = new Date(wall - offset * 3600000);
    if (isoToBerlinLocal(candidate.toISOString()) === local)
      return candidate.toISOString();
  }
  return null;
}

export function parseFollowUpInput(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const customer_name =
    typeof input.customer_name === "string" ? input.customer_name.trim() : "";
  const customer_email =
    typeof input.customer_email === "string"
      ? input.customer_email.trim() || null
      : null;
  const customer_phone =
    typeof input.customer_phone === "string"
      ? input.customer_phone.trim() || null
      : null;
  const offer_subject =
    typeof input.offer_subject === "string" ? input.offer_subject.trim() : "";
  const notes = typeof input.notes === "string" ? input.notes.trim() : "";
  const status = input.status ?? "pending";
  const start_time =
    typeof input.start_time === "string" ? input.start_time : "";
  const end_time = typeof input.end_time === "string" ? input.end_time : "";
  const start = new Date(start_time);
  const end = new Date(end_time);
  if (
    !title ||
    title.length > 120 ||
    !customer_name ||
    customer_name.length > 120 ||
    !offer_subject ||
    offer_subject.length > 180 ||
    notes.length > 1000 ||
    (customer_email !== null &&
      (customer_email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer_email))) ||
    (customer_phone !== null && !/^\+[1-9]\d{6,14}$/.test(customer_phone)) ||
    !["pending", "completed", "rescheduled"].includes(String(status)) ||
    !timestamp.test(start_time) ||
    !timestamp.test(end_time) ||
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    end.getTime() <= start.getTime() ||
    end.getTime() - start.getTime() > 24 * 60 * 60 * 1000 ||
    start.getUTCFullYear() < 2000 ||
    end.getUTCFullYear() > 2099 ||
    berlinDay.format(start) !== berlinDay.format(end)
  )
    return null;
  return {
    title,
    customer_name,
    customer_email,
    customer_phone,
    offer_subject,
    notes,
    status: status as FollowUpStatus,
    start_time: start.toISOString(),
    end_time: end.toISOString(),
  };
}

export function parseFollowUpRange(from: string | null, to: string | null) {
  if (
    !from ||
    !to ||
    !/^\d{4}-\d{2}-\d{2}$/.test(from) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(to)
  )
    return null;
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  const span = (end.getTime() - start.getTime()) / 86400000;
  if (
    !Number.isFinite(span) ||
    span < 0 ||
    span > 100 ||
    start.toISOString().slice(0, 10) !== from ||
    end.toISOString().slice(0, 10) !== to
  )
    return null;
  return {
    from: new Date(start.getTime() - 86400000).toISOString(),
    to: new Date(end.getTime() + 2 * 86400000).toISOString(),
  };
}

