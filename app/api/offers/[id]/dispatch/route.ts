import {
  offerAuth,
  offerError,
  offerHeaders,
  validOfferId,
  validOrigin,
} from "@/lib/offers-api";
import {
  OfferSubmissionError,
  type OfferDeliveryAttempt,
  parseOfferDispatchRequest,
  resolveOfferDeliveryAdapters,
} from "@/lib/offer-delivery";
import { GRAPH_MAIL_PDF_MAX_BYTES } from "@/lib/offer-graph-adapter";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type DispatchClaim = { offer_id: string; attempts: OfferDeliveryAttempt[] };

function isDispatchClaim(value: unknown): value is DispatchClaim {
  if (!value || typeof value !== "object") return false;
  const claim = value as Record<string, unknown>;
  return (
    typeof claim.offer_id === "string" &&
    Array.isArray(claim.attempts) &&
    claim.attempts.length >= 1 &&
    claim.attempts.length <= 2 &&
    claim.attempts.every(
      (attempt: unknown) =>
        !!attempt &&
        typeof attempt === "object" &&
        typeof (attempt as OfferDeliveryAttempt).attempt_id === "string" &&
        typeof (attempt as OfferDeliveryAttempt).delivery_id === "string" &&
        typeof (attempt as OfferDeliveryAttempt).recipient === "string" &&
        typeof (attempt as OfferDeliveryAttempt).pdf_path === "string" &&
        ((attempt as OfferDeliveryAttempt).channel === "email" ||
          (attempt as OfferDeliveryAttempt).channel === "superchat"),
    )
  );
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await offerAuth();
  if (!auth) return offerError("Nicht angemeldet.", 401);
  if (!validOrigin(request)) return offerError("Ungültige Anfrage.", 403);
  const { id } = await context.params;
  if (!validOfferId(id)) return offerError("Angebot nicht gefunden.", 404);
  if (Number(request.headers.get("content-length")) > 256)
    return offerError("Ungültige Daten.", 400);
  let body: unknown = null;
  try {
    const raw = await request.text();
    if (raw.length > 256) return offerError("Ungültige Daten.", 400);
    if (raw) body = JSON.parse(raw);
  } catch {
    return offerError("Ungültige Daten.", 400);
  }
  const dispatch = parseOfferDispatchRequest(body);
  if (!dispatch) return offerError("Ungültiger Versandkanal.", 400);

  const { data: offer, error } = await auth.db
    .from("offers")
    .select("id,title,customer_name,recipient_email,recipient_phone,pdf_path,pdf_name,pdf_size,updated_at")
    .eq("id", id)
    .eq("owner_id", auth.user.id)
    .maybeSingle();
  if (error) return offerError("Angebot konnte nicht geladen werden.", 500);
  if (!offer) return offerError("Angebot nicht gefunden.", 404);
  if (!offer.recipient_email || !offer.recipient_phone)
    return offerError("Für den Versand sind E-Mail-Adresse und Mobilnummer erforderlich.", 409);
  if (!offer.pdf_path || !offer.pdf_name || !offer.pdf_size)
    return offerError("Bitte zuerst eine PDF hochladen.", 409);
  if (offer.pdf_size && offer.pdf_size > GRAPH_MAIL_PDF_MAX_BYTES)
    return offerError("Für den automatischen Versand darf die PDF höchstens 2,9 MB groß sein.", 413);

  const setup = await resolveOfferDeliveryAdapters(auth.user.id);
  if (!setup)
    return Response.json(
      {
        error:
          "Versand noch nicht eingerichtet. Outlook-Verbindung und Superchat-Konfiguration fehlen.",
        code: "delivery_not_configured",
      },
      { status: 503, headers: offerHeaders },
    );
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceKey || !supabaseUrl)
    return offerError("Versand noch nicht eingerichtet.", 503);
  // Read the owner's private PDF before claiming an attempt. No public URL is
  // created and a missing/corrupt file cannot leave a queued attempt behind.
  const { data: blob, error: downloadError } = await auth.db.storage
    .from("offer-pdfs")
    .download(offer.pdf_path);
  if (downloadError || !blob)
    return offerError("PDF konnte nicht geladen werden.", 409);
  const pdf = new Uint8Array(await blob.arrayBuffer());
  if (
    pdf.length !== offer.pdf_size ||
    pdf.length > GRAPH_MAIL_PDF_MAX_BYTES ||
    new TextDecoder().decode(pdf.subarray(0, 5)) !== "%PDF-"
  )
    return offerError("PDF ist ungültig oder zu groß.", 409);

  const service = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: claimed, error: claimError } = await service.rpc(
    "request_offer_dispatch",
    {
      selected_offer: id,
      selected_owner: auth.user.id,
      selected_channel: dispatch.channel,
      selected_pdf_path: offer.pdf_path,
      selected_updated_at: offer.updated_at,
      selected_recipient_email: offer.recipient_email,
      selected_recipient_phone: offer.recipient_phone,
    },
  );
  if (claimError)
    return offerError(
      claimError.code === "P0002"
        ? "Angebot nicht gefunden."
        : "Versand bereits angefordert oder nur ein fehlgeschlagener Kanal darf erneut gesendet werden.",
      claimError.code === "P0002" ? 404 : 409,
    );
  if (!isDispatchClaim(claimed) || claimed.offer_id !== id)
    return offerError("Versandstatus konnte nicht geladen werden.", 500);

  const results = await Promise.all(
    claimed.attempts.map(async (attempt) => {
      const record = async (
        state: "sending" | "sent" | "failed" | "unknown",
        messageId: string | null = null,
        reason: string | null = null,
      ) =>
        service.rpc("record_offer_delivery_event", {
          selected_attempt: attempt.attempt_id,
          provider_event_id: `app:${state}:${attempt.attempt_id}`,
          next_state: state,
          new_provider_message_id: messageId,
          new_failure_reason: reason,
        });

      const started = await record("sending");
      if (started.error || started.data !== true)
        return { channel: attempt.channel, state: "unknown" as const };

      let state: "sent" | "failed" | "unknown";
      let messageId: string | null = null;
      let reason: string | null = null;
      try {
        const accepted = await setup.adapters[attempt.channel].send({
          attempt,
          title: offer.title,
          customerName: offer.customer_name,
          messageBody: setup.emailBody(offer.title, offer.customer_name),
          pdfName: offer.pdf_name,
          pdf,
        });
        state = accepted.state;
        messageId = accepted.providerMessageId;
      } catch (sendError) {
        state =
          sendError instanceof OfferSubmissionError
            ? sendError.outcome
            : "unknown";
        reason =
          state === "failed" && sendError instanceof OfferSubmissionError
            ? sendError.message
            : null;
      }
      const recorded = await record(state, messageId, reason);
      return {
        channel: attempt.channel,
        state: recorded.error || recorded.data !== true ? "unknown" : state,
      };
    }),
  );
  return Response.json(
    { offer_id: id, attempts: results },
    { status: 202, headers: offerHeaders },
  );
}
