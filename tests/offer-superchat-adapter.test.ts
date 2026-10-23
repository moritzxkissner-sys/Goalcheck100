import test from "node:test";
import assert from "node:assert/strict";
import { createSuperchatAdapter } from "../lib/offer-superchat-adapter";
import type { OfferDeliveryPayload } from "../lib/offer-delivery";

const payload: OfferDeliveryPayload = {
  attempt: {
    attempt_id: "attempt",
    delivery_id: "delivery",
    channel: "superchat",
    recipient: "+491701234567",
    pdf_path: "private.pdf",
    idempotency_key: "key",
  },
  title: "Angebot",
  customerName: "Kundin",
  messageBody: "",
  pdfName: "Angebot.pdf",
  pdf: new TextEncoder().encode("%PDF-1.7"),
};

test("Superchat uploads the PDF and sends the approved media template", async () => {
  const called: string[] = [];
  const adapter = createSuperchatAdapter(
    {
      apiKey: "private-key",
      channelId: "mc_channel",
      templateId: "tn_template",
      variables: () => [{ position: 1, value: "Kundin" }],
    },
    async (url, init) => {
      called.push(String(url));
      assert.equal(new Headers(init?.headers).get("X-API-KEY"), "private-key");
      if (String(url).endsWith("/files")) {
        const file = (init?.body as FormData).get("file") as File;
        assert.equal(file.name, "Angebot.pdf");
        assert.equal(await file.text(), "%PDF-1.7");
        return Response.json({ id: "fi_document" });
      }
      const body = JSON.parse(String(init?.body));
      assert.deepEqual(body.to, [{ identifier: "+491701234567" }]);
      assert.equal(body.from.channel_id, "mc_channel");
      assert.equal(body.content.type, "whats_app_template");
      assert.equal(body.content.template_id, "tn_template");
      assert.deepEqual(body.content.file, { id: "fi_document" });
      return Response.json({ id: "msg_sent" });
    },
  );
  assert.deepEqual(await adapter.send(payload), {
    state: "sent",
    providerMessageId: "msg_sent",
  });
  assert.deepEqual(called, [
    "https://api.superchat.com/v1.0/files",
    "https://api.superchat.com/v1.0/messages",
  ]);
});
