import {
  offerAuth,
  offerError,
  offerHeaders,
  validOfferId,
  validOrigin,
} from "@/lib/offers-api";
import { OFFER_COLUMNS, validateOfferPdf } from "@/lib/offers";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const auth = await offerAuth();
  if (!auth) return offerError("Nicht angemeldet.", 401);
  const { id } = await context.params;
  if (!validOfferId(id)) return offerError("PDF nicht gefunden.", 404);
  const { data: offer } = await auth.db
    .from("offers")
    .select("pdf_path,pdf_name")
    .eq("id", id)
    .eq("owner_id", auth.user.id)
    .maybeSingle();
  if (!offer?.pdf_path) return offerError("PDF nicht gefunden.", 404);
  const { data, error } = await auth.db.storage
    .from("offer-pdfs")
    .createSignedUrl(offer.pdf_path, 60, {
      download: offer.pdf_name ?? `${id}.pdf`,
    });
  if (error || !data)
    return offerError("PDF konnte nicht geladen werden.", 500);
  return Response.redirect(data.signedUrl, 302);
}

export async function POST(request: Request, context: Context) {
  const auth = await offerAuth();
  if (!auth) return offerError("Nicht angemeldet.", 401);
  if (!validOrigin(request)) return offerError("Ungültige Anfrage.", 403);
  const { id } = await context.params;
  if (!validOfferId(id)) return offerError("Angebot nicht gefunden.", 404);
  if (Number(request.headers.get("content-length")) > 11 * 1024 * 1024)
    return offerError("Die Datei ist zu groß.", 413);
  const { data: offer } = await auth.db
    .from("offers")
    .select("status,pdf_path")
    .eq("id", id)
    .eq("owner_id", auth.user.id)
    .maybeSingle();
  if (!offer || !["draft", "ready"].includes(offer.status))
    return offerError(
      "Angebot nicht gefunden oder bereits zum Versand vorbereitet.",
      409,
    );
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return offerError("Ungültiger Upload.", 400);
  }
  const file = form.get("file");
  if (!(file instanceof File))
    return offerError("Bitte eine PDF-Datei auswählen.", 400);
  const validation = validateOfferPdf(file);
  if (validation) return offerError(validation, 400);
  const content = new Uint8Array(await file.arrayBuffer());
  if (new TextDecoder().decode(content.subarray(0, 5)) !== "%PDF-")
    return offerError("Die Datei ist keine gültige PDF.", 400);
  const path = `${auth.user.id}/${id}/${crypto.randomUUID()}.pdf`;
  const bucket = auth.db.storage.from("offer-pdfs");
  const uploaded = await bucket.upload(path, content, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (uploaded.error)
    return offerError("PDF konnte nicht gespeichert werden.", 500);
  const { data, error } = await auth.db
    .from("offers")
    .update({
      pdf_path: path,
      pdf_name: file.name,
      pdf_size: file.size,
      status: "ready",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("owner_id", auth.user.id)
    .select(OFFER_COLUMNS)
    .maybeSingle();
  if (error || !data) {
    await bucket.remove([path]);
    return offerError("PDF-Metadaten konnten nicht gespeichert werden.", 500);
  }
  if (offer.pdf_path) await bucket.remove([offer.pdf_path]);
  return Response.json({ offer: data }, { headers: offerHeaders });
}
