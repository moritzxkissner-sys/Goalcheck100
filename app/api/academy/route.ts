import {
  offerAuth,
  offerError,
  offerHeaders,
  validOrigin,
} from "@/lib/offers-api";
import {
  getAcademyModuleVersion,
  parseAcademyProgress,
  scoreAcademyAnswers,
  type AcademyAnswers,
} from "@/lib/academy";

export const runtime = "nodejs";
function scored<
  T extends {
    module_id: string;
    answers: AcademyAnswers;
    catalog_version: string;
  },
>(row: T) {
  return {
    ...row,
    score:
      row.catalog_version === getAcademyModuleVersion(row.module_id)
        ? scoreAcademyAnswers(row.module_id, row.answers)
        : { correct: 0, total: 0, answered: 0, percentage: 0 },
  };
}
export async function GET() {
  const auth = await offerAuth();
  if (!auth) return offerError("Nicht angemeldet.", 401);
  const [progress, attempts, documents] = await Promise.all([
    auth.db
      .from("academy_progress")
      .select(
        "module_id,attempt_id,answers,position,completed,catalog_version,updated_at",
      )
      .eq("user_id", auth.user.id),
    auth.db
      .from("academy_attempts")
      .select("module_id,attempt_id,answers,catalog_version,created_at")
      .eq("user_id", auth.user.id)
      .order("created_at", { ascending: false }),
    auth.db
      .from("training_documents")
      .select(
        "id,title,document_version,module_id,processing_status,valid_from",
      )
      .eq("processing_status", "approved")
      .limit(200),
  ]);
  if (progress.error || attempts.error)
    return offerError("Akademie-Lernstand konnte nicht geladen werden.", 500);
  return Response.json(
    {
      progress: (progress.data ?? []).map(scored),
      attempts: (attempts.data ?? []).map(scored),
      documents: (documents.data ?? []).filter(
        (document) =>
          !document.valid_from ||
          document.valid_from <= new Date().toISOString().slice(0, 10),
      ),
    },
    { headers: offerHeaders },
  );
}
export async function PUT(request: Request) {
  const auth = await offerAuth();
  if (!auth) return offerError("Nicht angemeldet.", 401);
  if (!validOrigin(request)) return offerError("Ungültige Anfrage.", 403);
  const input = parseAcademyProgress(await request.json().catch(() => null));
  if (!input) return offerError("Bitte Antworten und Lernstand prüfen.", 400);
  const { data, error } = await auth.db.rpc("save_academy_progress", {
    p_module_id: input.module_id,
    p_attempt_id: input.attempt_id,
    p_answers: input.answers,
    p_position: input.position,
    p_completed: input.completed,
    p_catalog_version: getAcademyModuleVersion(input.module_id),
  });
  if (error)
    return offerError(
      "Lernstand konnte nicht gespeichert werden. Bitte neu laden und erneut versuchen.",
      error.code === "22023" ? 409 : 500,
    );
  const row = Array.isArray(data) ? data[0] : data;
  if (!row)
    return offerError("Lernstand konnte nicht gespeichert werden.", 500);
  const {
    module_id,
    attempt_id,
    answers,
    position,
    completed,
    catalog_version,
    updated_at,
  } = row;
  return Response.json(
    {
      progress: scored({
        module_id,
        attempt_id,
        answers,
        position,
        completed,
        catalog_version,
        updated_at,
      }),
    },
    { headers: offerHeaders },
  );
}
