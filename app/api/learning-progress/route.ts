import {
  offerAuth,
  offerError,
  offerHeaders,
  validOrigin,
} from "@/lib/offers-api";
import { parseLearningProgress } from "@/lib/learning";

export const runtime = "nodejs";

export async function GET() {
  const auth = await offerAuth();
  if (!auth) return offerError("Nicht angemeldet.", 401);
  const { data, error } = await auth.db
    .from("learning_progress")
    .select("track_id,completed_units,total_units,updated_at")
    .eq("user_id", auth.user.id);
  if (error) return offerError("Lernstand konnte nicht geladen werden.", 500);
  return Response.json({ progress: data }, { headers: offerHeaders });
}

export async function PUT(request: Request) {
  const auth = await offerAuth();
  if (!auth) return offerError("Nicht angemeldet.", 401);
  if (!validOrigin(request)) return offerError("Ungültige Anfrage.", 403);
  const input = parseLearningProgress(await request.json().catch(() => null));
  if (!input) return offerError("Bitte Lernstand prüfen.", 400);
  const { data, error } = await auth.db
    .from("learning_progress")
    .upsert(
      { ...input, user_id: auth.user.id, updated_at: new Date().toISOString() },
      { onConflict: "user_id,track_id" },
    )
    .select("track_id,completed_units,total_units,updated_at")
    .single();
  if (error)
    return offerError("Lernstand konnte nicht gespeichert werden.", 500);
  return Response.json({ progress: data }, { headers: offerHeaders });
}

