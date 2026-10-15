"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { supabaseServer, isConfigured } from "@/lib/supabase/server";
import {
  cancellationSchema,
  entrySchema,
  fixedCostSchema,
  goalSchema,
  monthSchema,
  teamCalendarEntrySchema,
} from "@/lib/validation";
import { berlinDate } from "@/lib/metrics";
import type { TeamCalendarEntry } from "@/lib/team-calendar";
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
export async function addCancellation(input: unknown) {
  try {
    const parsed = cancellationSchema.safeParse(input);
    if (!parsed.success)
      return { error: "Bitte prüfe den Storno-Betrag und das Buchungsdatum." };
    if (parsed.data.occurred_on > berlinDate())
      return { error: "Das Datum darf nicht in der Zukunft liegen." };
    const { db, user } = await member();
    const { error } = await db
      .from("cancellation_entries")
      .insert({ ...parsed.data, user_id: user.id });
    if (error && error.code !== "23505")
      return { error: "Das Storno konnte nicht gespeichert werden." };
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
export async function removeCancellation(id: string) {
  try {
    const { db, user } = await member();
    const { error } = await db
      .from("cancellation_entries")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) return { error: "Storno konnte nicht gelöscht werden." };
    revalidatePath("/");
    return { success: true };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Löschen fehlgeschlagen.",
    };
  }
}

export async function saveFixedCost(input: unknown, id?: string) {
  try {
    const parsed = fixedCostSchema.safeParse(input);
    if (!parsed.success)
      return { error: "Bitte prüfe Name, Betrag und Turnus." };
    const { db, user } = await member();
    if (id) {
      const { data, error } = await db
        .from("fixed_costs")
        .update(parsed.data)
        .eq("id", id)
        .eq("user_id", user.id)
        .select("id")
        .maybeSingle();
      if (error || !data)
        return { error: "Der Posten konnte nicht geändert werden." };
    } else {
      const { error } = await db
        .from("fixed_costs")
        .insert({ ...parsed.data, user_id: user.id });
      if (error)
        return { error: "Der Posten konnte nicht gespeichert werden." };
    }
    revalidatePath("/");
    return { success: true };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Speichern fehlgeschlagen.",
    };
  }
}

export async function removeFixedCost(id: string) {
  try {
    const { db, user } = await member();
    const { data, error } = await db
      .from("fixed_costs")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle();
    if (error || !data)
      return { error: "Der Posten konnte nicht gelöscht werden." };
    revalidatePath("/");
    return { success: true };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Löschen fehlgeschlagen.",
    };
  }
}

export async function createTeamCalendarEntry(input: unknown) {
  try {
    const parsed = teamCalendarEntrySchema.safeParse(input);
    if (!parsed.success)
      return {
        error: "Bitte prüfe Mitarbeiter, Zeitraum, Grund und Kommentar.",
      };
    const { db, user } = await member();
    if (parsed.data.user_id !== user.id)
      return { error: "Du kannst nur eigene Termine eintragen." };
    const { error } = await db.from("team_calendar_entries").insert({
      user_id: user.id,
      starts_on: parsed.data.starts_on,
      ends_on: parsed.data.ends_on,
      reason: parsed.data.reason,
      comment: parsed.data.comment,
    });
    if (error) return { error: "Der Termin konnte nicht gespeichert werden." };
    revalidatePath("/");
    return { success: true };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Speichern fehlgeschlagen.",
    };
  }
}

export async function removeTeamCalendarEntry(id: string) {
  try {
    if (!z.uuid().safeParse(id).success)
      return { error: "Ungültiger Kalendereintrag." };
    const { db, user } = await member();
    const { data, error } = await db
      .from("team_calendar_entries")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle();
    if (error || !data)
      return { error: "Der Termin konnte nicht gelöscht werden." };
    revalidatePath("/");
    return { success: true };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Löschen fehlgeschlagen.",
    };
  }
}

export async function loadTeamCalendarMonth(month: string): Promise<{
  entries: TeamCalendarEntry[];
  error?: string;
}> {
  try {
    if (!monthSchema.safeParse(month).success)
      return { entries: [], error: "Ungültiger Kalendermonat." };
    const { db } = await member();
    const [year, monthNumber] = month.split("-").map(Number);
    const firstDay = `${month}-01`;
    const lastDay = new Date(Date.UTC(year, monthNumber, 0))
      .toISOString()
      .slice(0, 10);
    const entries: TeamCalendarEntry[] = [];
    for (let offset = 0; ; offset += 500) {
      const page = await db
        .from("team_calendar_entries")
        .select("id,user_id,starts_on,ends_on,reason,comment,created_at")
        .lte("starts_on", lastDay)
        .gte("ends_on", firstDay)
        .order("starts_on")
        .order("id")
        .range(offset, offset + 499);
      if (page.error)
        return {
          entries: [],
          error: "Der Teamkalender konnte nicht geladen werden.",
        };
      entries.push(...(page.data as TeamCalendarEntry[]));
      if (page.data.length < 500) return { entries };
    }
  } catch (e) {
    return {
      entries: [],
      error:
        e instanceof Error
          ? e.message
          : "Der Teamkalender konnte nicht geladen werden.",
    };
  }
}
