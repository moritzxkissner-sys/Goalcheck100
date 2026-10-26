import {
  offerAuth,
  offerError,
  offerHeaders,
  validOfferId,
  validOrigin,
} from "@/lib/offers-api";
import { parseFollowUpInput } from "@/lib/follow-ups";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
const columns =
  "id,owner_id,assigned_to,title,customer_name,customer_email,customer_phone,offer_subject,start_time,end_time,status,notes,created_at,updated_at";

export async function PATCH(request: Request, context: Context) {
  const auth = await offerAuth();
  if (!auth) return offerError("Nicht angemeldet.", 401);
  if (!validOrigin(request)) return offerError("Ungültige Anfrage.", 403);
  const { id } = await context.params;
  if (!validOfferId(id)) return offerError("Termin nicht gefunden.", 404);
  const input = parseFollowUpInput(await request.json().catch(() => null));
  if (!input) return offerError("Bitte Termin und Kundendaten prüfen.", 400);
  const { data, error } = await auth.db
    .from("follow_up_tasks")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("owner_id", auth.user.id)
    .select(columns)
    .maybeSingle();
  if (error) return offerError("Termin konnte nicht geändert werden.", 500);
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
    .eq("owner_id", auth.user.id)
    .select("id")
    .maybeSingle();
  if (error) return offerError("Termin konnte nicht gelöscht werden.", 500);
  if (!data) return offerError("Termin nicht gefunden.", 404);
  return Response.json({ deleted: true }, { headers: offerHeaders });
}

