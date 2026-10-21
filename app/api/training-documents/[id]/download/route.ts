import { isConfigured, supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!isConfigured()) return new Response(null, { status: 404 });
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response(null, { status: 404 });
  const db = await supabaseServer();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return new Response(null, { status: 401 });
  const { data: profile } = await db
    .from("profiles")
    .select("active")
    .eq("id", user.id)
    .single();
  if (!profile?.active) return new Response(null, { status: 403 });
  const { data: document } = await db
    .from("training_documents")
    .select("storage_path")
    .eq("id", id)
    .single();
  if (!document) return new Response(null, { status: 404 });
  const { data, error } = await db.storage
    .from("training-documents")
    .createSignedUrl(document.storage_path, 60, { download: `${id}.pdf` });
  if (error || !data) return new Response(null, { status: 500 });
  return Response.redirect(data.signedUrl, 302);
}
