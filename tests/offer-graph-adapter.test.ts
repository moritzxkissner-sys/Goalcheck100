import test from "node:test";
import assert from "node:assert/strict";
import {
  createGraphMailAdapter,
  MailSubmissionError,
} from "../lib/offer-graph-adapter";
import type { OfferDeliveryPayload } from "../lib/offer-delivery";

const payload: OfferDeliveryPayload = {
  attempt: {
    attempt_id: "attempt",
    delivery_id: "delivery",
    channel: "email",
    recipient: "kunde@example.de",
    pdf_path: "private.pdf",
    idempotency_key: "key",
  },
  title: "Angebot",
  customerName: "Kundin",
  messageBody: "Ihr Angebot liegt bei.",
  pdfName: "Angebot.pdf",
  pdf: new TextEncoder().encode("%PDF-1.7"),
};

test("Graph acceptance sends the PDF from the delegated mailbox without claiming delivery", async () => {
  const adapter = createGraphMailAdapter("delegated-token", async (url, init) => {
    assert.equal(url, "https://graph.microsoft.com/v1.0/me/sendMail");
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer delegated-token");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.message.toRecipients[0].emailAddress.address, "kunde@example.de");
    assert.equal(body.message.attachments[0].contentBytes, "JVBERi0xLjc=");
    return new Response(null, { status: 202 });
  });
  assert.deepEqual(await adapter.send(payload), {
    state: "sent",
    providerMessageId: null,
  });
});

test("a Graph server error leaves the submission outcome unknown", async () => {
  const adapter = createGraphMailAdapter(
    "delegated-token",
    async () => new Response(null, { status: 503 }),
  );
  await assert.rejects(
    adapter.send(payload),
    (error) => error instanceof MailSubmissionError && error.outcome === "unknown",
  );
});
