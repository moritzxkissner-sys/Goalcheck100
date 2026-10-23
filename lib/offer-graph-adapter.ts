import type {
  OfferDeliveryAdapter,
  OfferDeliveryPayload,
  OfferProviderAcceptance,
} from "@/lib/offer-delivery";
import { OfferSubmissionError } from "@/lib/offer-delivery";

export const GRAPH_MAIL_PDF_MAX_BYTES = 2_900_000;

export { OfferSubmissionError as MailSubmissionError };

/**
 * Uses a delegated access token for the offer owner, scoped to Mail.Send.
 * Token acquisition, refresh and encrypted per-user storage belong to the
 * mailbox connection flow, which must be configured before this is activated.
 */
export function createGraphMailAdapter(
  accessToken: string,
  request: typeof fetch = fetch,
): OfferDeliveryAdapter {
  if (!accessToken) throw new Error("A delegated Graph token is required.");
  return {
    channel: "email",
    async send(payload: OfferDeliveryPayload): Promise<OfferProviderAcceptance> {
      if (payload.attempt.channel !== "email")
        throw new Error("Incorrect delivery channel.");
      if (
        payload.pdf.length < 1 ||
        payload.pdf.length > GRAPH_MAIL_PDF_MAX_BYTES ||
        new TextDecoder().decode(payload.pdf.subarray(0, 5)) !== "%PDF-"
      )
        throw new OfferSubmissionError("PDF is missing or too large.", "failed");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.attempt.recipient))
        throw new OfferSubmissionError("Invalid email recipient.", "failed");

      let response: Response;
      try {
        response = await request("https://graph.microsoft.com/v1.0/me/sendMail", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: {
              subject: payload.title,
              body: {
                contentType: "Text",
                content: payload.messageBody,
              },
              toRecipients: [
                { emailAddress: { address: payload.attempt.recipient } },
              ],
              attachments: [
                {
                  "@odata.type": "#microsoft.graph.fileAttachment",
                  name: payload.pdfName,
                  contentType: "application/pdf",
                  contentBytes: Buffer.from(payload.pdf).toString("base64"),
                },
              ],
            },
            saveToSentItems: true,
          }),
          signal: AbortSignal.timeout(20_000),
          cache: "no-store",
        });
      } catch {
        // A network error can occur after Exchange accepted the request.
        throw new OfferSubmissionError("Mail submission outcome is unknown.", "unknown");
      }
      if (response.status === 202) return { state: "sent", providerMessageId: null };
      if (response.status >= 500)
        throw new OfferSubmissionError("Mail submission outcome is unknown.", "unknown");
      throw new OfferSubmissionError("Mail submission was rejected.", "failed");
    },
  };
}
