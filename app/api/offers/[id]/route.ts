import {
  offerAuth,
  offerError,
  offerHeaders,
  validOfferId,
  validOrigin,
} from "@/lib/offers-api";
import { OFFER_COLUMNS, parseOfferInput } from "@/lib/offers";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
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
  const input = parseOfferInput(body);
  if (!input) return offerError("Bitte Angebotsdaten prüfen.", 400);
  const { data, error } = await auth.db
    .from("offers")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("owner_id", auth.user.id)
    .select(OFFER_COLUMNS)
    .maybeSingle();
  if (error) return offerError("Angebot konnte nicht geändert werden.", 500);
  if (!data)
    return offerError(
      "Angebot nicht gefunden oder bereits zum Versand vorbereitet.",
      404,
    );
  return Response.json({ offer: data }, { headers: offerHeaders });
}

export async function DELETE(request: Request, context: Context) {
  const auth = await offerAuth();
  if (!auth) return offerError("Nicht angemeldet.", 401);
  if (!validOrigin(request)) return offerError("Ungültige Anfrage.", 403);
  const { id } = await context.params;
  if (!validOfferId(id)) return offerError("Angebot nicht gefunden.", 404);
  const { data: offer } = await auth.db
    .from("offers")
    .select("pdf_path")
    .eq("id", id)
    .eq("owner_id", auth.user.id)
    .maybeSingle();
  if (!offer) return offerError("Angebot nicht gefunden.", 404);
  const { data, error } = await auth.db
    .from("offers")
    .delete()
    .eq("id", id)
    .eq("owner_id", auth.user.id)
    .select("id")
    .maybeSingle();
  if (error || !data)
    return offerError("Angebot konnte nicht gelöscht werden.", 409);
  if (offer.pdf_path)
    await auth.db.storage.from("offer-pdfs").remove([offer.pdf_path]);
  return Response.json({ deleted: true }, { headers: offerHeaders });
}
