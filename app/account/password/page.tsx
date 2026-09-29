import { redirect } from "next/navigation";
import AuthForm from "@/components/auth-form";
import { isConfigured, supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ChangePasswordPage() {
  if (!isConfigured()) redirect("/login");
  const db = await supabaseServer();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/login");
  return <AuthForm mode="change-password" />;
}
