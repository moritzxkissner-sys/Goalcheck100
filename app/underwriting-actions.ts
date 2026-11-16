"use server";
import { z } from "zod";
import { offerAuth } from "@/lib/offers-api";
import {
  attachmentSchema,
  validateUnderwritingFile,
  underwritingSchema,
  underwritingStatuses,
  type UnderwritingRequest,
  type UnderwritingAttachment,
  type UnderwritingEvent,
} from "@/lib/underwriting";
async function access() {
  const auth = await offerAuth();
  if (!auth) throw new Error("Bitte mit einem aktiven Teamkonto anmelden.");
  return auth;
}
function message(e: unknown) {
  return {
    error:
      e instanceof Error
        ? e.message
        : "Die Anfrage konnte nicht verarbeitet werden.",
  };
}
export async function loadUnderwriting(): Promise<{
  rows: UnderwritingRequest[];
  manager: boolean;
  customers: string[];
  error?: string;
}> {
  try {
    const { db } = await access();
    const rows: UnderwritingRequest[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await db
        .from("underwriting_requests")
        .select("*")
        .order("created_at", { ascending: false })
        .order("id")
        .range(offset, offset + 499);
      if (error)
        throw new Error(
          "Underwriting konnte nicht geladen werden. Bitte Einrichtung prüfen.",
        );
      rows.push(...data);
      if (data.length < 500) break;
    }
    const manager = await db.rpc("can_manage_underwriting");
    if (manager.error)
      throw new Error("Berechtigung konnte nicht geprüft werden.");
    const customers: string[] = [];
    for (let offset = 0; ; offset += 500) {
      const page = await db
        .rpc("underwriting_customers")
        .range(offset, offset + 499);
      if (page.error)
        throw new Error("Kundenliste konnte nicht geladen werden.");
      customers.push(
        ...page.data.map((r: { customer_name: string }) => r.customer_name),
      );
      if (page.data.length < 500) break;
    }
    return { rows, manager: !!manager.data, customers };
  } catch (e) {
    return { rows: [], manager: false, customers: [], ...message(e) };
  }
}
export async function prepareUnderwritingUpload(
  input: unknown,
  requestId: string,
) {
  try {
    const parsed = attachmentSchema.omit({ path: true }).parse(input);
    const fileError = validateUnderwritingFile(parsed);
    if (fileError) throw new Error(fileError);
    z.uuid().parse(requestId);
    const { db, user } = await access();
    const extension = {
      "application/pdf": "pdf",
      "image/jpeg": "jpg",
      "image/png": "png",
    }[parsed.type];
    const path = `${user.id}/${requestId}/${crypto.randomUUID()}.${extension}`;
    const { data, error } = await db.storage
      .from("underwriting")
      .createSignedUploadUrl(path, { upsert: false });
    if (error) throw new Error("Dateiablage konnte nicht vorbereitet werden.");
    return { path, token: data.token };
  } catch (e) {
    return message(e);
  }
}
export async function createUnderwriting(input: unknown) {
  try {
    const parsed = underwritingSchema.parse(input);
    const { db } = await access();
    const { error } = await db.rpc("create_underwriting", { payload: parsed });
    if (error)
      throw new Error(
        "Anfrage nicht gespeichert. Bitte Angaben und hochgeladene Anhänge prüfen.",
      );
    return { success: true };
  } catch (e) {
    return message(e);
  }
}
export async function underwritingDetails(id: string): Promise<{
  attachments: UnderwritingAttachment[];
  events: UnderwritingEvent[];
  error?: string;
}> {
  try {
    z.uuid().parse(id);
    const { db } = await access();
    const attachments = await db
      .from("underwriting_attachments")
      .select("*")
      .eq("request_id", id);
    if (attachments.error)
      throw new Error("Anhänge konnten nicht geladen werden.");
    const events: UnderwritingEvent[] = [];
    for (let offset = 0; ; offset += 500) {
      const page = await db
        .from("underwriting_events")
        .select("*")
        .eq("request_id", id)
        .order("created_at")
        .order("id")
        .range(offset, offset + 499);
      if (page.error) throw new Error("Verlauf konnte nicht geladen werden.");
      events.push(...page.data);
      if (page.data.length < 500) break;
    }
    return { attachments: attachments.data, events };
  } catch (e) {
    return { attachments: [], events: [], ...message(e) };
  }
}
export async function updateUnderwriting(input: unknown, status: unknown) {
  try {
    const { id, ...fields } = underwritingSchema
      .omit({ attachments: true })
      .parse(input);
    const value = z
      .enum(
        Object.keys(underwritingStatuses) as [
          keyof typeof underwritingStatuses,
          ...(keyof typeof underwritingStatuses)[],
        ],
      )
      .parse(status);
    const { db } = await access();
    const { data, error } = await db
      .from("underwriting_requests")
      .update({ ...fields, status: value })
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error || !data)
      throw new Error("Änderung nicht gespeichert. Bitte Berechtigung prüfen.");
    return { success: true };
  } catch (e) {
    return message(e);
  }
}
export async function commentUnderwriting(id: string, note: string) {
  try {
    z.uuid().parse(id);
    z.string().trim().min(1).max(1000).parse(note);
    const { db } = await access();
    const { error } = await db.rpc("comment_underwriting", {
      rid: id,
      content: note,
    });
    if (error) throw new Error("Rückmeldung konnte nicht gespeichert werden.");
    return { success: true };
  } catch (e) {
    return message(e);
  }
}
export async function downloadUnderwriting(id: string) {
  try {
    z.uuid().parse(id);
    const { db } = await access();
    const { data: row, error } = await db
      .from("underwriting_attachments")
      .select("path,name")
      .eq("id", id)
      .single();
    if (error) throw new Error("Kein Zugriff auf diesen Anhang.");
    const result = await db.storage
      .from("underwriting")
      .createSignedUrl(row.path, 60, { download: row.name });
    if (result.error) throw new Error("Download konnte nicht erstellt werden.");
    return { url: result.data.signedUrl };
  } catch (e) {
    return message(e);
  }
}
