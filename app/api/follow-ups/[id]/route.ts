import {
  offerAuth,
  offerError,
  offerHeaders,
  validOfferId,
  validOrigin,
} from "@/lib/offers-api";
import {
  FOLLOW_UP_COLUMNS as columns,
  parseFollowUpInput,
  parseFollowUpOutcomeInput,
} from "@/lib/follow-ups";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const auth = await offerAuth();
  if (!auth) return offerError("Nicht angemeldet.", 401);
  if (!validOrigin(request)) return offerError("Ungültige Anfrage.", 403);
  const { id } = await context.params;
  if (!validOfferId(id)) return offerError("Termin nicht gefunden.", 404);
  const body = await request.json().catch(() => null);
  const outcomeChange =
    body && typeof body === "object" && Object.hasOwn(body, "outcome_status");
  const input = outcomeChange
    ? parseFollowUpOutcomeInput(body)
    : parseFollowUpInput(body);
  if (!input) return offerError("Bitte Termin und Kundendaten prüfen.", 400);
  const { data, error } = await auth.db
    .from("follow_up_tasks")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(columns)
    .maybeSingle();
  if (error)
    return offerError(
      "Termin konnte nicht geändert werden.",
      error.code === "42501" ? 403 : 500,
    );
  if (!data) return offerError("Termin nicht gefunden.", 404);
  return Response.json({ task: data }, { headers: offerHeaders });
}

export async function DELETE(request: Request, context: Context) {
  const auth = await offerAuth();
  if (!auth) return offerError("Nicht angemeldet.", 401);
  if (!validOrigin(request)) return offerError("Ungültige Anfrage.", 403);
  const { id } = await context.params;
  if (!validOfferId(id)) return offerError("Termin nicht gefunden.", 404);
  const { data, error } = await auth.db
    .from("follow_up_tasks")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) return offerError("Termin konnte nicht gelöscht werden.", 500);
  if (!data) return offerError("Termin nicht gefunden.", 404);
  return Response.json({ deleted: true }, { headers: offerHeaders });
}
