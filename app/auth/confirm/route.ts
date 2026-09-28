import { type NextRequest, NextResponse } from "next/server";
import { isConfigured, supabaseServer } from "@/lib/supabase/server";
export async function GET(request: NextRequest) {
  const token_hash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  if (
    isConfigured() &&
    token_hash &&
    (type === "invite" || type === "recovery")
  ) {
    const db = await supabaseServer();
    const { error } = await db.auth.verifyOtp({ token_hash, type });
    if (!error)
      return new NextResponse(null, {
        status: 303,
        headers: { Location: "/auth/password", "Cache-Control": "no-store" },
      });
  }
  return new NextResponse(null, {
    status: 303,
    headers: { Location: "/login?notice=expired", "Cache-Control": "no-store" },
  });
}
