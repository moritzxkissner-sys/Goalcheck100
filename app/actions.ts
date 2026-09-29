"use server";
import { revalidatePath } from "next/cache";
import { supabaseServer, isConfigured } from "@/lib/supabase/server";
import { entrySchema, goalSchema } from "@/lib/validation";
import { berlinDate } from "@/lib/metrics";
async function member() {
  if (!isConfigured()) throw new Error("Supabase ist noch nicht eingerichtet.");
  const db = await supabaseServer();
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error || !user) throw new Error("Bitte melde dich erneut an.");
  const { data: profile } = await db
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .eq("active", true)
    .single();
  if (!profile)
    throw new Error("Dein Teamzugang ist noch nicht freigeschaltet.");
  return { db, user };
}
export async function addEntry(input: unknown) {
  try {
    const parsed = entrySchema.safeParse(input);
    if (!parsed.success)
      return {
        error:
          "Bitte prüfe Betrag, Versicherung, Vertragsart und Datum (max. 2 Nachkommastellen).",
      };
    if (parsed.data.occurred_on > berlinDate())
      return { error: "Das Datum darf nicht in der Zukunft liegen." };
    const { db, user } = await member();
    const { error } = await db
      .from("sales_entries")
      .insert({ ...parsed.data, user_id: user.id });
    if (error && error.code !== "23505")
      return {
        error:
          "Der Eintrag konnte nicht gespeichert werden. Bitte erneut versuchen.",
      };
    revalidatePath("/");
    return { success: true };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Speichern fehlgeschlagen.",
    };
  }
}
export async function saveGoal(input: unknown) {
  try {
    const parsed = goalSchema.safeParse(input);
    if (!parsed.success)
      return { error: "Bitte gib ein gültiges Monatsziel größer als 0 ein." };
    const { db, user } = await member();
    const { error } = await db.from("monthly_goals").upsert(
      {
        user_id: user.id,
        month: `${parsed.data.month}-01`,
        target: parsed.data.target,
      },
      { onConflict: "user_id,month" },
    );
    if (error)
      return { error: "Das Monatsziel konnte nicht gespeichert werden." };
    revalidatePath("/");
    return { success: true };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Speichern fehlgeschlagen.",
    };
  }
}
export async function removeEntry(id: string) {
  try {
    const { db, user } = await member();
    const { error } = await db
      .from("sales_entries")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) return { error: "Löschen fehlgeschlagen." };
    revalidatePath("/");
    return { success: true };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Löschen fehlgeschlagen.",
    };
  }
}
