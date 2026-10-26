import {
  offerAuth,
  offerError,
  offerHeaders,
  validOrigin,
} from "@/lib/offers-api";
import { parseFollowUpInput, parseFollowUpRange } from "@/lib/follow-ups";

export const runtime = "nodejs";
const columns =
  "id,owner_id,assigned_to,title,customer_name,customer_email,customer_phone,offer_subject,start_time,end_time,status,notes,created_at,updated_at";

export async function GET(request: Request) {
  const auth = await offerAuth();
  if (!auth) return offerError("Nicht angemeldet.", 401);
  const url = new URL(request.url);
  const range = parseFollowUpRange(
    url.searchParams.get("from"),
    url.searchParams.get("to"),
  );
  if (!range) return offerError("Ungültiger Zeitraum.", 400);
  const { data, error } = await auth.db
    .from("follow_up_tasks")
    .select(columns)
    .eq("owner_id", auth.user.id)
    .gte("start_time", range.from)
    .lt("start_time", range.to)
    .order("start_time", { ascending: true })
    .limit(500);
  if (error) return offerError("Termine konnten nicht geladen werden.", 500);
  return Response.json({ tasks: data }, { headers: offerHeaders });
}

export async function POST(request: Request) {
  const auth = await offerAuth();
  if (!auth) return offerError("Nicht angemeldet.", 401);
  if (!validOrigin(request)) return offerError("Ungültige Anfrage.", 403);
  const input = parseFollowUpInput(await request.json().catch(() => null));
  if (!input) return offerError("Bitte Termin und Kundendaten prüfen.", 400);
  const { data, error } = await auth.db
    .from("follow_up_tasks")
    .insert({ ...input, owner_id: auth.user.id, assigned_to: auth.user.id })
    .select(columns)
    .single();
  if (error) return offerError("Termin konnte nicht gespeichert werden.", 500);
  return Response.json({ task: data }, { status: 201, headers: offerHeaders });
}

