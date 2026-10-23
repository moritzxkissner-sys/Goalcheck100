import { isConfigured, supabaseServer } from "@/lib/supabase/server";

export const offerHeaders = { "Cache-Control": "private, no-store" };

export function offerError(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: offerHeaders });
}

export function validOfferId(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    id,
  );
}

export function validOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

export async function offerAuth() {
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
