import { resolveOfferDeliveryAdapters } from "@/lib/offer-delivery";
import { offerAuth, offerError, offerHeaders } from "@/lib/offers-api";

export const runtime = "nodejs";

export async function GET() {
  const auth = await offerAuth();
  if (!auth) return offerError("Nicht angemeldet.", 401);

  const setup = await resolveOfferDeliveryAdapters(auth.user.id);
  const ready = Boolean(
    setup &&
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
      process.env.NEXT_PUBLIC_SUPABASE_URL,
  );
  return Response.json(
    ready
      ? { ready: true }
      : {
          ready: false,
          reason:
            "Automatischer Versand ist noch nicht eingerichtet. Outlook-Verbindung und Superchat-Einrichtung stehen aus.",
        },
    { headers: offerHeaders },
  );
}
