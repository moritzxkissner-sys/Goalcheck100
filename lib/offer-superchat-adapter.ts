import {
  OfferSubmissionError,
  type OfferDeliveryAdapter,
  type OfferDeliveryPayload,
  type OfferProviderAcceptance,
} from "@/lib/offer-delivery";

export type SuperchatTemplateVariable = { position: number; value: string };

export type SuperchatAdapterConfig = {
  apiKey: string;
  channelId: string;
  templateId: string;
  /** Must match the actual approved template's placeholders. */
  variables: (payload: OfferDeliveryPayload) => SuperchatTemplateVariable[];
};

function objectId(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  return typeof record.id === "string" && record.id ? record.id : null;
}

/** Uploads the private PDF and submits the approved WhatsApp media template. */
export function createSuperchatAdapter(
  config: SuperchatAdapterConfig,
  request: typeof fetch = fetch,
): OfferDeliveryAdapter {
  if (!config.apiKey || !config.channelId || !config.templateId)
    throw new Error("Superchat channel, template and API key are required.");
  return {
    channel: "superchat",
    async send(payload: OfferDeliveryPayload): Promise<OfferProviderAcceptance> {
      if (payload.attempt.channel !== "superchat")
        throw new Error("Incorrect delivery channel.");
      if (!/^\+[1-9]\d{6,14}$/.test(payload.attempt.recipient))
        throw new OfferSubmissionError("Invalid phone recipient.", "failed");
      if (
        payload.pdf.length < 1 ||
        new TextDecoder().decode(payload.pdf.subarray(0, 5)) !== "%PDF-"
      )
        throw new OfferSubmissionError("Invalid PDF.", "failed");

      const form = new FormData();
      form.append(
        "file",
        new Blob([new Uint8Array(payload.pdf)], { type: "application/pdf" }),
        payload.pdfName,
      );
      let uploaded: Response;
      try {
        uploaded = await request("https://api.superchat.com/v1.0/files", {
          method: "POST",
          headers: { "X-API-KEY": config.apiKey },
          body: form,
          signal: AbortSignal.timeout(20_000),
          cache: "no-store",
        });
      } catch {
        // An orphaned upload is possible, but no customer message was sent.
        throw new OfferSubmissionError("PDF upload failed.", "failed");
      }
      if (!uploaded.ok)
        throw new OfferSubmissionError("PDF upload was rejected.", "failed");
      const uploadBody: unknown = await uploaded.json().catch(() => null);
      const fileId =
        objectId(uploadBody) ||
        objectId((uploadBody as { file?: unknown } | null)?.file);
      if (!fileId)
        throw new OfferSubmissionError("PDF upload returned no file ID.", "failed");

      let sent: Response;
      try {
        sent = await request("https://api.superchat.com/v1.0/messages", {
          method: "POST",
          headers: {
            "X-API-KEY": config.apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            to: [{ identifier: payload.attempt.recipient }],
            from: { channel_id: config.channelId },
            content: {
              type: "whats_app_template",
              template_id: config.templateId,
              variables: config.variables(payload),
              file: { id: fileId },
            },
          }),
          signal: AbortSignal.timeout(20_000),
          cache: "no-store",
        });
      } catch {
        throw new OfferSubmissionError("Superchat submission outcome is unknown.", "unknown");
      }
      if (sent.status >= 500)
        throw new OfferSubmissionError("Superchat submission outcome is unknown.", "unknown");
      if (!sent.ok)
        throw new OfferSubmissionError("Superchat rejected the message.", "failed");
      const messageBody: unknown = await sent.json().catch(() => null);
      const messageId =
        objectId(messageBody) ||
        objectId((messageBody as { message?: unknown } | null)?.message);
      if (!messageId)
        throw new OfferSubmissionError("Superchat message ID is unknown.", "unknown");
      return { state: "sent", providerMessageId: messageId };
    },
  };
}
