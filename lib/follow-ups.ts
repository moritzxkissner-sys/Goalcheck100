export type FollowUpStatus = "pending" | "completed" | "rescheduled";
export type AppointmentType = "follow_up" | "phone";

export type FollowUpMember = { id: string; full_name: string };

export function validFollowUpAssignee(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

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
  appointment_type?: AppointmentType | null;
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
    (input.appointment_type !== undefined &&
      input.appointment_type !== null &&
      input.appointment_type !== "follow_up" &&
      input.appointment_type !== "phone") ||
    (input.assigned_to !== undefined &&
      !validFollowUpAssignee(input.assigned_to)) ||
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
    ...(input.appointment_type === undefined
      ? {}
      : { appointment_type: input.appointment_type as AppointmentType | null }),
    ...(input.assigned_to === undefined
      ? {}
      : { assigned_to: input.assigned_to as string }),
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

export const FOLLOW_UP_SEARCH_PAGE_SIZE = 50;
export const FOLLOW_UP_COLUMNS =
  "id,owner_id,assigned_to,title,customer_name,customer_email,customer_phone,offer_subject,start_time,end_time,status,appointment_type,notes,created_at,updated_at";

function searchDate(value: string | null, nextDay = false) {
  if (value === null || value === "") return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  )
    return null;
  if (nextDay) date.setUTCDate(date.getUTCDate() + 1);
  return berlinLocalToIso(`${date.toISOString().slice(0, 10)}T00:00`);
}

export function parseFollowUpSearch(params: URLSearchParams) {
  const q = (params.get("q") ?? "").trim();
  const rawType = params.get("type");
  const type = rawType === "all" || rawType === "" ? null : rawType;
  const pageText = params.get("page") ?? "0";
  const from = searchDate(params.get("from"));
  const to = searchDate(params.get("to"), true);
  if (
    (q.length > 0 && q.length < 2) ||
    q.length > 120 ||
    (type !== null && type !== "follow_up" && type !== "phone") ||
    !/^(0|[1-9]\d{0,5})$/.test(pageText) ||
    from === null ||
    to === null ||
    (from !== undefined && to !== undefined && from >= to)
  )
    return null;
  return {
    q,
    type: type as AppointmentType | null,
    from,
    to,
    page: Number(pageText),
  };
}

// A literal, case-insensitive regex avoids PostgREST's special * LIKE alias.
// Quote the entire value so commas/parentheses cannot introduce filter clauses.
export function followUpSearchFilter(q: string) {
  const literal = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = `"${literal.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  const clauses = [
    "customer_name",
    "title",
    "offer_subject",
    "customer_email",
    "customer_phone",
    "notes",
  ].map((column) => `${column}.imatch.${pattern}`);
  const normalized = q.toLocaleLowerCase("de-DE").replace(/[-_\s]+/g, " ");
  for (const [type, labels] of [
    ["phone", ["telefon", "telefontermin", "phone"]],
    ["follow_up", ["follow up", "nachfassen"]],
  ] as const) {
    if (labels.some((label) => label.includes(normalized)))
      clauses.push(`appointment_type.eq.${type}`);
  }
  return clauses.join(",");
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
