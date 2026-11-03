import {
  documentAuth,
  invalidOrigin,
  noStore,
} from "@/lib/academy-documents-server";
import { parseQuestionDraft } from "@/lib/academy-documents";
export async function GET(request: Request) {
  const auth = await documentAuth();
  if (!auth)
    return Response.json(
      { error: "Nicht angemeldet." },
      { status: 401, headers: noStore },
    );
  if (!auth.canManage)
    return Response.json(
      { error: "Keine Berechtigung." },
      { status: 403, headers: noStore },
    );
  const id = new URL(request.url).searchParams.get("document_id");
  if (!id || !/^[0-9a-f-]{36}$/i.test(id))
    return Response.json(
      { error: "Quelle fehlt." },
      { status: 400, headers: noStore },
    );
  const { data, error } = await auth.db
    .from("academy_question_drafts")
    .select(
      "id,document_id,document_version,citation,prompt,choices,correct_indices,explanation,module_id,status",
    )
    .eq("document_id", id)
    .order("created_at", { ascending: false })
    .limit(100);
  return error
    ? Response.json(
        { error: "Entwürfe konnten nicht geladen werden." },
        { status: 500, headers: noStore },
      )
    : Response.json({ drafts: data }, { headers: noStore });
}
export async function POST(request: Request) {
  return save(request, false);
}
export async function PATCH(request: Request) {
  return save(request, true);
}
async function save(request: Request, update: boolean) {
  const auth = await documentAuth();
  if (!auth)
    return Response.json(
      { error: "Nicht angemeldet." },
      { status: 401, headers: noStore },
    );
  if (!auth.canManage || invalidOrigin(request))
    return Response.json(
      { error: "Keine Berechtigung." },
      { status: 403, headers: noStore },
    );
  if (Number(request.headers.get("content-length")) > 24000)
    return Response.json(
      { error: "Anfrage zu groß." },
      { status: 413, headers: noStore },
    );
  const value = await request.json().catch(() => null),
    draft = parseQuestionDraft(value);
  if (
    !draft ||
    (update &&
      (typeof value.id !== "string" || !/^[0-9a-f-]{36}$/i.test(value.id)))
  )
    return Response.json(
      { error: "Bitte Quelle, Beleg und gültige Antworten angeben." },
      { status: 400, headers: noStore },
    );
  const { document_id, document_version, ...editable } = draft;
  const query = update
    ? auth.db
        .from("academy_question_drafts")
        .update(editable)
        .eq("id", value.id)
        .eq("document_id", document_id)
        .eq("document_version", document_version)
    : auth.db
        .from("academy_question_drafts")
        .insert({ ...draft, created_by: auth.user.id });
  const { data, error } = await query.select("id").single();
  if (error)
    return Response.json(
      {
        error:
          "Entwurf nicht gespeichert. Quelle/Version prüfen; eine Freigabe benötigt ein freigegebenes, gültiges Dokument.",
      },
      { status: 409, headers: noStore },
    );
  return Response.json(
    { id: data.id },
    { status: update ? 200 : 201, headers: noStore },
  );
}

