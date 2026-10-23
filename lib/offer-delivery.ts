/** Server-side contract for the two independent delivery channels. */
export type OfferDeliveryChannel = "email" | "superchat";

export type OfferDeliveryAttempt = {
  attempt_id: string;
  delivery_id: string;
  channel: OfferDeliveryChannel;
  recipient: string;
  pdf_path: string;
  idempotency_key: string;
};

export type OfferDeliveryPayload = {
  attempt: OfferDeliveryAttempt;
  title: string;
  customerName: string;
  messageBody: string;
  pdfName: string;
  pdf: Uint8Array;
};

export type OfferProviderAcceptance = {
  /** A provider acceptance is never proof of delivery to the recipient. */
  state: "sent";
  providerMessageId: string | null;
};

export class OfferSubmissionError extends Error {
  constructor(
    message: string,
    public readonly outcome: "failed" | "unknown",
  ) {
    super(message);
    this.name = "OfferSubmissionError";
  }
}

export interface OfferDeliveryAdapter {
  readonly channel: OfferDeliveryChannel;
  send(payload: OfferDeliveryPayload): Promise<OfferProviderAcceptance>;
}

export type OfferDeliveryAdapters = Record<
  OfferDeliveryChannel,
  OfferDeliveryAdapter
>;

export type OfferDeliverySetup = {
  adapters: OfferDeliveryAdapters;
  emailBody: (title: string, customerName: string) => string;
};

/**
 * Activation requires a delegated Microsoft Graph connection for the owner,
 * a configured Superchat WhatsApp channel and approved PDF template, and
 * verified delivery-event processing. Until those are configured, dispatch
 * must not create attempts or call either provider.
 */
export async function resolveOfferDeliveryAdapters(
  ownerId: string,
): Promise<OfferDeliverySetup | null> {
  void ownerId;
  return null;
}

export function parseOfferDispatchRequest(
  value: unknown,
): { channel: OfferDeliveryChannel | null } | null {
  if (value === null) return { channel: null };
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).length !== 1 ||
    (input.channel !== "email" && input.channel !== "superchat")
  )
    return null;
  return { channel: input.channel };
}
