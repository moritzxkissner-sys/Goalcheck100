import { isConfigured, supabaseServer } from "@/lib/supabase/server";
export const noStore = { "Cache-Control": "private, no-store" };
export async function documentAuth() {
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
  if (!profile?.active) return null;
  const { data: canManage } = await db.rpc("can_manage_training_documents");
  return { db, user, canManage: canManage === true };
}
export function invalidOrigin(request: Request) {
  const origin = request.headers.get("origin");
  try {
    return !!origin && new URL(origin).origin !== new URL(request.url).origin;
  } catch {
    return true;
  }
}
