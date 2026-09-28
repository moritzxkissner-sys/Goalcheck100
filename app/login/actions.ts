"use server";
import { redirect } from "next/navigation";
import { isConfigured, supabaseServer } from "@/lib/supabase/server";
import { z } from "zod";
export async function login(email: string, password: string) {
  if (!isConfigured())
    return {
      error:
        "Die Team-Anmeldung ist noch nicht eingerichtet. Nutze vorerst die Demo.",
    };
  if (!z.email().safeParse(email).success || !password)
    return { error: "Bitte gib E-Mail und Passwort ein." };
  const db = await supabaseServer();
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error)
    return {
      error:
        "Anmeldung fehlgeschlagen. Bitte prüfe deine Zugangsdaten oder versuche es später erneut.",
    };
  redirect("/");
}
export async function resetPassword(email: string) {
  if (!isConfigured())
    return { error: "Die Team-Anmeldung ist noch nicht eingerichtet." };
  if (!z.email().safeParse(email).success)
    return { error: "Bitte gib eine gültige E-Mail-Adresse ein." };
  const db = await supabaseServer();
  // The email template uses the trusted Supabase Site URL, not a forwarded Host header.
  const { error } = await db.auth.resetPasswordForEmail(email);
  if (error)
    return {
      error:
        "Die Anfrage konnte nicht verarbeitet werden. Bitte versuche es später erneut.",
    };
  return {
    success:
      "Falls ein Zugang besteht, erhältst du eine E-Mail zum Zurücksetzen deines Passworts.",
  };
}
export async function updatePassword(password: string) {
  if (!isConfigured())
    return { error: "Die Team-Anmeldung ist noch nicht eingerichtet." };
  if (password.length < 12 || password.length > 128)
    return { error: "Bitte verwende 12 bis 128 Zeichen." };
  const db = await supabaseServer();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user)
    return { error: "Der Link ist abgelaufen. Bitte fordere einen neuen an." };
  const { error } = await db.auth.updateUser({ password });
  if (error)
    return {
      error:
        "Das Passwort konnte nicht gespeichert werden. Bitte wähle ein anderes oder fordere einen neuen Link an.",
    };
  redirect("/");
}
export async function signOut() {
  if (isConfigured()) {
    const db = await supabaseServer();
    await db.auth.signOut();
  }
  redirect("/login");
}
