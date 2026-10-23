import {
  offerAuth,
  offerError,
  offerHeaders,
  validOrigin,
} from "@/lib/offers-api";
import {
  OFFER_APPOINTMENT_COLUMNS,
  OFFER_COLUMNS,
  parseOfferInput,
} from "@/lib/offers";

export const runtime = "nodejs";

export async function GET() {
  const auth = await offerAuth();
  if (!auth) return offerError("Nicht angemeldet.", 401);
  const { data, error } = await auth.db
    .from("offers")
    .select(OFFER_COLUMNS)
    .order("starts_at", { ascending: true })
    .limit(500);
  if (error) return offerError("Angebote konnten nicht geladen werden.", 500);
  const { data: appointments, error: appointmentError } = await auth.db
    .from("offer_appointments")
    .select(OFFER_APPOINTMENT_COLUMNS)
    .order("starts_at", { ascending: true })
    .limit(2000);
  if (appointmentError)
    return offerError("Termine konnten nicht geladen werden.", 500);
  const { data: deliveries, error: deliveryError } = await auth.db
    .from("offer_deliveries")
    .select("id,offer_id,channel,state,recipient,attempt_count,provider_message_id,last_error,requested_at,sent_at,delivered_at,read_at,failed_at,updated_at")
    .order("requested_at", { ascending: false })
    .limit(1000);
  if (deliveryError)
    return offerError("Versandstatus konnte nicht geladen werden.", 500);
  return Response.json(
    { offers: data, appointments, deliveries },
    { headers: offerHeaders },
  );
}

export async function POST(request: Request) {
  const auth = await offerAuth();
  if (!auth) return offerError("Nicht angemeldet.", 401);
  if (!validOrigin(request)) return offerError("Ungültige Anfrage.", 403);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return offerError("Ungültige Daten.", 400);
  }
  const input = parseOfferInput(body);
  if (!input) return offerError("Bitte Angebotsdaten prüfen.", 400);
  const { data, error } = await auth.db
    .from("offers")
    .insert({ ...input, owner_id: auth.user.id })
    .select(OFFER_COLUMNS)
    .single();
  if (error) return offerError("Angebot konnte nicht gespeichert werden.", 500);
  return Response.json({ offer: data }, { status: 201, headers: offerHeaders });
}
