export const OFFER_MAX_BYTES = 10 * 1024 * 1024;

export type OfferStatus =
  "draft" | "ready" | "pending_connection" | "sent" | "failed";

export type Offer = {
  id: string;
  owner_id: string;
  title: string;
  customer_name: string;
  starts_at: string;
  notes: string;
  recipient_email: string | null;
  recipient_phone: string | null;
  hubspot_contact_id: string | null;
  superchat_contact_id: string | null;
  pdf_name: string | null;
  pdf_size: number | null;
  status: OfferStatus;
  created_at: string;
  updated_at: string;
};

export type OfferAppointment = {
  id: string;
  offer_id: string;
  owner_id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  notes: string;
  due_date: string;
  status: "pending" | "completed" | "rescheduled";
  assigned_to: string;
  remind_note: string;
  created_at: string;
  updated_at: string;
};

export const OFFER_APPOINTMENT_COLUMNS =
  "id,offer_id,owner_id,title,starts_at,ends_at,notes,due_date,status,assigned_to,remind_note,created_at,updated_at";

export const OFFER_COLUMNS =
  "id,owner_id,title,customer_name,starts_at,notes,recipient_email,recipient_phone,hubspot_contact_id,superchat_contact_id,pdf_name,pdf_size,status,created_at,updated_at";

export function parseOfferInput(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const customer_name =
    typeof input.customer_name === "string" ? input.customer_name.trim() : "";
  const notes = typeof input.notes === "string" ? input.notes.trim() : "";
  const recipient_email =
    typeof input.recipient_email === "string"
      ? input.recipient_email.trim() || null
      : null;
  const recipient_phone =
    typeof input.recipient_phone === "string"
      ? input.recipient_phone.trim() || null
      : null;
  const starts_at = typeof input.starts_at === "string" ? input.starts_at : "";
  const hubspot_contact_id =
    typeof input.hubspot_contact_id === "string"
      ? input.hubspot_contact_id.trim() || null
      : null;
  const superchat_contact_id =
    typeof input.superchat_contact_id === "string"
      ? input.superchat_contact_id.trim() || null
      : null;
  const date = new Date(starts_at);
  if (
    !title ||
    title.length > 120 ||
    !customer_name ||
    customer_name.length > 120 ||
    notes.length > 1000 ||
    (recipient_email !== null &&
      (recipient_email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient_email))) ||
    (recipient_phone !== null && !/^\+[1-9]\d{6,14}$/.test(recipient_phone)) ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      starts_at,
    ) ||
    !Number.isFinite(date.getTime()) ||
    date.getUTCFullYear() < 2000 ||
    date.getUTCFullYear() > 2099 ||
    (hubspot_contact_id?.length ?? 0) > 120 ||
    (superchat_contact_id?.length ?? 0) > 120
  )
    return null;
  return {
    title,
    customer_name,
    starts_at: date.toISOString(),
    notes,
    recipient_email,
    recipient_phone,
    hubspot_contact_id,
    superchat_contact_id,
  };
}

export function validateOfferPdf(file: File) {
  if (file.size < 1 || file.size > OFFER_MAX_BYTES)
    return "Die PDF muss zwischen 1 Byte und 10 MB groß sein.";
  if (
    file.type !== "application/pdf" ||
    !file.name.toLowerCase().endsWith(".pdf")
  )
    return "Bitte eine PDF-Datei auswählen.";
  if (file.name.length > 180) return "Der Dateiname ist zu lang.";
  return null;
}

export function parseOfferAppointmentInput(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const notes = typeof input.notes === "string" ? input.notes.trim() : "";
  const remind_note =
    typeof input.remind_note === "string" ? input.remind_note.trim() : "";
  const status = input.status ?? "pending";
  const starts_at = typeof input.starts_at === "string" ? input.starts_at : "";
  const ends_at =
    typeof input.ends_at === "string" && input.ends_at ? input.ends_at : null;
  const timestamp =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
  const start = new Date(starts_at);
  const end = ends_at ? new Date(ends_at) : null;
  if (
    !title ||
    title.length > 120 ||
    notes.length > 500 ||
    remind_note.length > 500 ||
    !["pending", "completed", "rescheduled"].includes(String(status)) ||
    !timestamp.test(starts_at) ||
    !Number.isFinite(start.getTime()) ||
    start.getUTCFullYear() < 2000 ||
    start.getUTCFullYear() > 2099 ||
    (ends_at !== null &&
      (!timestamp.test(ends_at) ||
        !end ||
        !Number.isFinite(end.getTime()) ||
        end.getTime() < start.getTime() ||
        end.getUTCFullYear() > 2099))
  )
    return null;
  return {
    title,
    starts_at: start.toISOString(),
    ends_at: end?.toISOString() ?? null,
    notes,
    due_date: start.toISOString(),
    status: status as OfferAppointment["status"],
    remind_note,
  };
}

