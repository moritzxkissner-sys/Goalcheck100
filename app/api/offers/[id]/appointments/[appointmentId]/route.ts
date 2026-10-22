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
type Context = { params: Promise<{ id: string; appointmentId: string }> };

export async function PATCH(request: Request, context: Context) {
  const auth = await offerAuth();
  if (!auth) return offerError("Nicht angemeldet.", 401);
  if (!validOrigin(request)) return offerError("Ungültige Anfrage.", 403);
  const { id, appointmentId } = await context.params;
  if (!validOfferId(id) || !validOfferId(appointmentId))
    return offerError("Termin nicht gefunden.", 404);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return offerError("Ungültige Daten.", 400);
  }
  const input = parseOfferAppointmentInput(body);
  if (!input) return offerError("Bitte Termindaten prüfen.", 400);
  const { data, error } = await auth.db
    .from("offer_appointments")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", appointmentId)
    .eq("offer_id", id)
    .eq("owner_id", auth.user.id)
    .select(OFFER_APPOINTMENT_COLUMNS)
    .maybeSingle();
  if (error) return offerError("Termin konnte nicht geändert werden.", 500);
  if (!data) return offerError("Termin nicht gefunden.", 404);
  return Response.json({ appointment: data }, { headers: offerHeaders });
}

export async function DELETE(request: Request, context: Context) {
  const auth = await offerAuth();
  if (!auth) return offerError("Nicht angemeldet.", 401);
  if (!validOrigin(request)) return offerError("Ungültige Anfrage.", 403);
  const { id, appointmentId } = await context.params;
  if (!validOfferId(id) || !validOfferId(appointmentId))
    return offerError("Termin nicht gefunden.", 404);
  const { data, error } = await auth.db
    .from("offer_appointments")
    .delete()
    .eq("id", appointmentId)
    .eq("offer_id", id)
    .eq("owner_id", auth.user.id)
    .select("id")
    .maybeSingle();
  if (error) return offerError("Termin konnte nicht gelöscht werden.", 500);
  if (!data) return offerError("Termin nicht gefunden.", 404);
  return Response.json({ deleted: true }, { headers: offerHeaders });
}
