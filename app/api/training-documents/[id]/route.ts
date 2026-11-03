import {
  documentAuth,
  invalidOrigin,
  noStore,
} from "@/lib/academy-documents-server";
import { parseDocumentMetadata } from "@/lib/academy-documents";
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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
  const value = await request.json().catch(() => null);
  const metadata = value && parseDocumentMetadata(value);
  if (!metadata)
    return Response.json(
      { error: "Ungültige Quellenangaben." },
      { status: 400, headers: noStore },
    );
  const { id } = await params;
  const { data, error } = await auth.db
    .from("training_documents")
    .update(metadata)
    .eq("id", id)
    .select("id")
    .single();
  if (error || !data)
    return Response.json(
      {
        error:
          "Speichern nicht möglich. Versionen mit Fragenentwürfen sind gesperrt.",
      },
      { status: 409, headers: noStore },
    );
  return Response.json({ id }, { headers: noStore });
}

