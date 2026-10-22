import {
  offerAuth,
  offerError,
  offerHeaders,
  validOfferId,
  validOrigin,
} from "@/lib/offers-api";
import { OFFER_COLUMNS } from "@/lib/offers";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await offerAuth();
  if (!auth) return offerError("Nicht angemeldet.", 401);
  if (!validOrigin(request)) return offerError("Ungültige Anfrage.", 403);
  const { id } = await context.params;
  if (!validOfferId(id)) return offerError("Angebot nicht gefunden.", 404);
  const { data: eventId, error } = await auth.db.rpc("request_offer_dispatch", {
    selected_offer: id,
  });
  if (error)
    return offerError(
      error.code === "P0002"
        ? "Angebot nicht gefunden."
        : "PDF und Kontakt-ID erforderlich oder Versand bereits vorbereitet.",
      error.code === "P0002" ? 404 : 409,
    );
  const { data: offer } = await auth.db
    .from("offers")
    .select(OFFER_COLUMNS)
    .eq("id", id)
    .single();
  return Response.json(
    { offer, event: { id: eventId, state: "pending_connection" } },
    { headers: offerHeaders },
  );
}
