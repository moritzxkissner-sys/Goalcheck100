import { isConfigured, supabaseServer } from "@/lib/supabase/server";
import { validateTrainingFile } from "@/lib/training-documents";

export const runtime = "nodejs";

const noStore = { "Cache-Control": "private, no-store" };

async function authorizedDb() {
  if (!isConfigured()) return null;
  const db = await supabaseServer();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return null;
  const { data: profile } = await db
    .from("profiles")
    .select("active")
    .eq("id", user.id)
    .single();
  return profile?.active ? { db, user } : null;
}

export async function GET() {
  const auth = await authorizedDb();
  if (!auth)
    return Response.json(
      { error: "Nicht angemeldet." },
      { status: 401, headers: noStore },
    );
  const { data, error } = await auth.db
    .from("training_documents")
    .select("id,owner_id,title,description,file_size,created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error)
    return Response.json(
      { error: "Dokumente konnten nicht geladen werden." },
      { status: 500, headers: noStore },
    );
  return Response.json({ documents: data }, { headers: noStore });
}

export async function POST(request: Request) {
  const auth = await authorizedDb();
  if (!auth)
    return Response.json(
      { error: "Nicht angemeldet." },
      { status: 401, headers: noStore },
    );
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(request.url).host)
    return Response.json(
      { error: "Ungültige Anfrage." },
      { status: 403, headers: noStore },
    );
  const contentLength = Number(request.headers.get("content-length"));
  if (contentLength > 11 * 1024 * 1024)
    return Response.json(
      { error: "Die Datei ist zu groß." },
      { status: 413, headers: noStore },
    );
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json(
      { error: "Ungültiger Upload." },
      { status: 400, headers: noStore },
    );
  }
  const file = form.get("file");
  const title = String(form.get("title") ?? "").trim();
  const description = String(form.get("description") ?? "").trim();
  if (!(file instanceof File))
    return Response.json(
      { error: "Bitte eine PDF-Datei auswählen." },
      { status: 400, headers: noStore },
    );
  const validationError = validateTrainingFile(file);
  if (
    validationError ||
    !title ||
    title.length > 120 ||
    description.length > 500
  )
    return Response.json(
      { error: validationError ?? "Titel oder Beschreibung ist ungültig." },
      { status: 400, headers: noStore },
    );
  const content = new Uint8Array(await file.arrayBuffer());
  if (new TextDecoder().decode(content.subarray(0, 5)) !== "%PDF-")
    return Response.json(
      { error: "Die Datei ist keine gültige PDF." },
      { status: 400, headers: noStore },
    );
  const id = crypto.randomUUID();
  const storage_path = `${auth.user.id}/${id}.pdf`;
  const bucket = auth.db.storage.from("training-documents");
  const upload = await bucket.upload(storage_path, content, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (upload.error)
    return Response.json(
      {
        error:
          "Upload fehlgeschlagen. Ist die Datenbankmigration eingerichtet?",
      },
      { status: 500, headers: noStore },
    );
  const saved = await auth.db.from("training_documents").insert({
    id,
    owner_id: auth.user.id,
    title,
    description,
    storage_path,
    file_size: file.size,
  });
  if (saved.error) {
    await bucket.remove([storage_path]);
    return Response.json(
      { error: "Dokument konnte nicht gespeichert werden." },
      { status: 500, headers: noStore },
    );
  }
  return Response.json({ id }, { status: 201, headers: noStore });
}
