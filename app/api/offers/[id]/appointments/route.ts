import {
  offerAuth,
  offerError,
  offerHeaders,
  validOfferId,
  validOrigin,
} from "@/lib/offers-api";
import {
  OFFER_APPOINTMENT_COLUMNS,
  parseOfferAppointmentInput,
} from "@/lib/offers";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const auth = await offerAuth();
  if (!auth) return offerError("Nicht angemeldet.", 401);
  const { id } = await context.params;
  if (!validOfferId(id)) return offerError("Angebot nicht gefunden.", 404);
  const { data: offer } = await auth.db
    .from("offers")
    .select("id")
    .eq("id", id)
    .eq("owner_id", auth.user.id)
    .maybeSingle();
  if (!offer) return offerError("Angebot nicht gefunden.", 404);
  const { data, error } = await auth.db
    .from("offer_appointments")
    .select(OFFER_APPOINTMENT_COLUMNS)
    .eq("offer_id", id)
    .eq("owner_id", auth.user.id)
    .order("starts_at", { ascending: true });
  if (error) return offerError("Termine konnten nicht geladen werden.", 500);
  return Response.json({ appointments: data }, { headers: offerHeaders });
}

export async function POST(request: Request, context: Context) {
  const auth = await offerAuth();
  if (!auth) return offerError("Nicht angemeldet.", 401);
  if (!validOrigin(request)) return offerError("Ungültige Anfrage.", 403);
  const { id } = await context.params;
  if (!validOfferId(id)) return offerError("Angebot nicht gefunden.", 404);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return offerError("Ungültige Daten.", 400);
  }
  const input = parseOfferAppointmentInput(body);
  if (!input) return offerError("Bitte Termindaten prüfen.", 400);
  const { data: offer } = await auth.db
    .from("offers")
    .select("id")
    .eq("id", id)
    .eq("owner_id", auth.user.id)
    .maybeSingle();
  if (!offer) return offerError("Angebot nicht gefunden.", 404);
  const { data, error } = await auth.db
    .from("offer_appointments")
    .insert({ ...input, offer_id: id, owner_id: auth.user.id })
    .select(OFFER_APPOINTMENT_COLUMNS)
    .single();
  if (error) return offerError("Termin konnte nicht gespeichert werden.", 500);
  return Response.json(
    { appointment: data },
    { status: 201, headers: offerHeaders },
  );
}
