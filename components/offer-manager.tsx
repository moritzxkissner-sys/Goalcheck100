"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
} from "react";
import { createBrowserClient } from "@supabase/ssr";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Pencil,
  Plus,
  Search,
  Send,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import {
  validateOfferPdf,
  type Offer,
  type OfferAppointment,
} from "@/lib/offers";
import styles from "./offer-manager.module.css";

type OfferForm = {
  title: string;
  customer_name: string;
  starts_at: string;
  notes: string;
  hubspot_contact_id: string;
  superchat_contact_id: string;
  recipient_email: string;
  recipient_phone: string;
};
type AppointmentForm = {
  title: string;
  starts_at: string;
  ends_at: string;
  notes: string;
};
type AppointmentEditor = { offer: Offer; appointment?: OfferAppointment };
type SendForm = {
  customer_name: string;
  recipient_email: string;
  recipient_phone: string;
};
type OfferDelivery = {
  offer_id: string;
  channel: "email" | "superchat";
  state:
    "queued" | "sending" | "sent" | "delivered" | "read" | "failed" | "unknown";
  recipient: string;
  attempt_count: number;
  last_error: string | null;
  requested_at: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  failed_at: string | null;
  updated_at: string;
};
const emptySendForm: SendForm = {
  customer_name: "",
  recipient_email: "",
  recipient_phone: "",
};

const emptyForm: OfferForm = {
  title: "",
  customer_name: "",
  starts_at: "",
  notes: "",
  hubspot_contact_id: "",
  superchat_contact_id: "",
  recipient_email: "",
  recipient_phone: "",
};
const weekdays = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const offerCache = new Map<
  string,
  {
    offers: Offer[];
    appointments: OfferAppointment[];
    deliveries: OfferDelivery[];
    at: number;
  }
>();
const CACHE_MS = 60_000;
const DISPATCH_MAX_BYTES = 2_900_000;
const dateFormatter = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Berlin",
});
const timeFormatter = new Intl.DateTimeFormat("de-DE", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Berlin",
});
const dayKeyFormatter = new Intl.DateTimeFormat("sv-SE", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "Europe/Berlin",
});
const monthFormatter = new Intl.DateTimeFormat("de-DE", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function dayKey(value: string) {
  return dayKeyFormatter.format(new Date(value));
}

function appointmentEndLabel(appointment: OfferAppointment) {
  if (!appointment.ends_at) return "";
  const end = new Date(appointment.ends_at);
  const date =
    dayKey(appointment.ends_at) === dayKey(appointment.starts_at)
      ? ""
      : `${dateFormatter.format(end)} · `;
  return ` – ${date}${timeFormatter.format(end)} Uhr`;
}

function monthTitle(month: string) {
  const [year, number] = month.split("-").map(Number);
  return monthFormatter.format(new Date(Date.UTC(year, number - 1, 1)));
}

function shiftMonth(month: string, amount: number) {
  const [year, number] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, number - 1 + amount, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function localInputDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Europe/Berlin",
  }).formatToParts(date);
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

function statusLabel(status: Offer["status"]) {
  switch (status) {
    case "ready":
      return "Bereit";
    case "pending_connection":
      return "Verbindung ausstehend";
    case "sent":
      return "Versand angenommen";
    case "failed":
      return "Fehlgeschlagen";
    default:
      return "Entwurf";
  }
}

function deliveryLabel(state: OfferDelivery["state"]) {
  switch (state) {
    case "queued":
      return "In Warteschlange";
    case "sending":
      return "Wird versendet";
    case "sent":
      return "Vom Anbieter angenommen";
    case "delivered":
      return "Zugestellt";
    case "read":
      return "Gelesen";
    case "failed":
      return "Fehlgeschlagen";
    case "unknown":
      return "Status unklar";
  }
}

function dateTimeLabel(value: string | null | undefined) {
  if (!value) return "–";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "–";
  return `${dateFormatter.format(date)}, ${timeFormatter.format(date)} Uhr`;
}

async function parseResponse(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(body.error ?? "Die Aktion ist fehlgeschlagen.");
  return body;
}

export default function OfferManager({
  userId,
  ownerName = "",
  ownerEmail = "",
  demo = false,
}: {
  userId: string;
  ownerName?: string;
  ownerEmail?: string;
  demo?: boolean;
}) {
  const initial = offerCache.get(userId);
  const [offers, setOffers] = useState<Offer[]>(initial?.offers ?? []);
  const [appointments, setAppointments] = useState<OfferAppointment[]>(
    initial?.appointments ?? [],
  );
  const [deliveries, setDeliveries] = useState<OfferDelivery[]>(
    initial?.deliveries ?? [],
  );
  const [loading, setLoading] = useState(!demo && !initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState<"send" | "status">("send");
  const [sendForm, setSendForm] = useState<SendForm>(emptySendForm);
  const [sendFile, setSendFile] = useState<File | null>(null);
  const [sendDragging, setSendDragging] = useState(false);
  const [sendOfferId, setSendOfferId] = useState<string | null>(null);
  const [sendUploaded, setSendUploaded] = useState(false);
  const [sendBusy, setSendBusy] = useState(false);
  const [dispatchReadiness, setDispatchReadiness] = useState<{
    ready: boolean;
    reason: string;
  } | null>(null);
  const sendFileInput = useRef<HTMLInputElement | null>(null);
  const [month, setMonth] = useState(() =>
    dayKeyFormatter.format(new Date()).slice(0, 7),
  );
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState<Offer | "new" | null>(null);
  const [form, setForm] = useState<OfferForm>(emptyForm);
  const [appointmentEditor, setAppointmentEditor] =
    useState<AppointmentEditor | null>(null);
  const [appointmentForm, setAppointmentForm] = useState<AppointmentForm>({
    title: "Nachfassen",
    starts_at: "",
    ends_at: "",
    notes: "",
  });
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = useCallback(
    async (force = false) => {
      if (demo) return;
      const cached = offerCache.get(userId);
      if (!force && cached && Date.now() - cached.at < CACHE_MS) {
        setOffers(cached.offers);
        setAppointments(cached.appointments);
        setDeliveries(cached.deliveries);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const body = await parseResponse(
          await fetch("/api/offers", { cache: "no-store" }),
        );
        setOffers(body.offers ?? []);
        setAppointments(body.appointments ?? []);
        setDeliveries(body.deliveries ?? []);
        offerCache.set(userId, {
          offers: body.offers ?? [],
          appointments: body.appointments ?? [],
          deliveries: body.deliveries ?? [],
          at: Date.now(),
        });
        setError("");
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Angebote konnten nicht geladen werden.",
        );
      } finally {
        setLoading(false);
      }
    },
    [demo, userId],
  );

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const checkDispatchReadiness = useCallback(async () => {
    if (demo) return;
    try {
      const response = await fetch("/api/offers/dispatch-readiness", {
        cache: "no-store",
      });
      const body = await parseResponse(response);
      setDispatchReadiness({
        ready: body.ready === true,
        reason:
          typeof body.reason === "string"
            ? body.reason
            : "Outlook und Superchat müssen erst eingerichtet werden.",
      });
    } catch {
      setDispatchReadiness({
        ready: false,
        reason:
          "Die Versandverbindungen konnten nicht geprüft werden. Bitte später erneut versuchen.",
      });
    }
  }, [demo]);

  useEffect(() => {
    const timer = setTimeout(() => void checkDispatchReadiness(), 0);
    return () => clearTimeout(timer);
  }, [checkDispatchReadiness]);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (demo || !url || !key) return;
    const client = createBrowserClient(url, key);
    const channel = client
      .channel(`offer-deliveries-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "offer_deliveries",
          filter: `owner_id=eq.${userId}`,
        },
        () => void load(true),
      )
      .subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  }, [demo, load, userId]);

  function changeSendForm(field: keyof SendForm, value: string) {
    setSendForm((current) => ({ ...current, [field]: value }));
    setSendOfferId(null);
    setSendUploaded(false);
  }

  function selectSendFile(file?: File) {
    if (!file) return;
    const fileError = validateOfferPdf(file);
    if (fileError) {
      setSendFile(null);
      setSendOfferId(null);
      setSendUploaded(false);
      setError(fileError);
      return;
    }
    if (file.size > DISPATCH_MAX_BYTES) {
      setSendFile(null);
      setError("Für den Versand darf die PDF höchstens 2,9 MB groß sein.");
      return;
    }
    setError("");
    setSendFile(file);
    setSendOfferId(null);
    setSendUploaded(false);
  }

  async function sendNewOffer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (demo || sendBusy || busy) return;
    if (!dispatchReadiness?.ready) {
      setError("Der Versand ist für deinen Zugang noch nicht eingerichtet.");
      return;
    }
    const customer = sendForm.customer_name.trim();
    const email = sendForm.recipient_email.trim();
    const phone = sendForm.recipient_phone.trim();
    if (!customer || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Bitte Kundennamen und eine gültige E-Mail-Adresse eingeben.");
      return;
    }
    if (!/^\+[1-9]\d{6,14}$/.test(phone)) {
      setError(
        "Bitte eine Mobilnummer im internationalen Format eingeben, z. B. +491701234567.",
      );
      return;
    }
    if (!sendFile) {
      setError("Bitte eine Angebots-PDF auswählen.");
      return;
    }
    const fileError = validateOfferPdf(sendFile);
    if (fileError) {
      setError(fileError);
      return;
    }
    if (sendFile.size > DISPATCH_MAX_BYTES) {
      setError("Für den Versand darf die PDF höchstens 2,9 MB groß sein.");
      return;
    }
    setSendBusy(true);
    setError("");
    setNotice("");
    try {
      let offerId = sendOfferId;
      if (!offerId) {
        const created = await parseResponse(
          await fetch("/api/offers", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: `Angebot für ${customer}`,
              customer_name: customer,
              starts_at: new Date().toISOString(),
              notes: "",
              recipient_email: email,
              recipient_phone: phone,
            }),
          }),
        );
        offerId = created.offer.id;
        setSendOfferId(offerId);
      }
      if (!sendUploaded) {
        const uploadBody = new FormData();
        uploadBody.set("file", sendFile);
        await parseResponse(
          await fetch(`/api/offers/${offerId}/pdf`, {
            method: "POST",
            body: uploadBody,
          }),
        );
        setSendUploaded(true);
      }
      await parseResponse(
        await fetch(`/api/offers/${offerId}/dispatch`, {
          method: "POST",
        }),
      );
      setNotice(
        "Der Versand wurde gestartet. Den Stand beider Kanäle siehst du unter „Versendete Angebote / Status“.",
      );
      setSendForm(emptySendForm);
      setSendFile(null);
      setSendOfferId(null);
      setSendUploaded(false);
      if (sendFileInput.current) sendFileInput.current.value = "";
      setTab("status");
      await load(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Das Angebot konnte nicht versendet werden. Bitte erneut versuchen.",
      );
      await load(true);
    } finally {
      setSendBusy(false);
    }
  }

  async function retryDelivery(
    offer: Offer,
    channel: OfferDelivery["channel"],
  ) {
    if (demo || busy || sendBusy || !dispatchReadiness?.ready) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await parseResponse(
        await fetch(`/api/offers/${offer.id}/dispatch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channel }),
        }),
      );
      setNotice(
        `${channel === "email" ? "E-Mail" : "Superchat"} wird erneut versendet.`,
      );
      await load(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Erneuter Versand fehlgeschlagen.",
      );
      await load(true);
    } finally {
      setBusy(false);
    }
  }

  function openEditor(offer?: Offer, date?: string) {
    setError("");
    setEditor(offer ?? "new");
    setForm(
      offer
        ? {
            title: offer.title,
            customer_name: offer.customer_name,
            starts_at: localInputDate(offer.starts_at),
            notes: offer.notes ?? "",
            hubspot_contact_id: offer.hubspot_contact_id ?? "",
            superchat_contact_id: offer.superchat_contact_id ?? "",
            recipient_email: offer.recipient_email ?? "",
            recipient_phone: offer.recipient_phone ?? "",
          }
        : {
            ...emptyForm,
            starts_at: `${date ?? dayKeyFormatter.format(new Date())}T09:00`,
          },
    );
  }

  function openAppointmentEditor(offer: Offer, appointment?: OfferAppointment) {
    setError("");
    setAppointmentEditor({ offer, appointment });
    setAppointmentForm(
      appointment
        ? {
            title: appointment.title,
            starts_at: localInputDate(appointment.starts_at),
            ends_at: appointment.ends_at
              ? localInputDate(appointment.ends_at)
              : "",
            notes: appointment.notes ?? "",
          }
        : {
            title: "Nachfassen",
            starts_at: `${selectedDay ?? dayKeyFormatter.format(new Date())}T09:00`,
            ends_at: "",
            notes: "",
          },
    );
  }

  async function saveAppointment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (demo || !appointmentEditor || busy) return;
    const start = new Date(appointmentForm.starts_at);
    const end = appointmentForm.ends_at
      ? new Date(appointmentForm.ends_at)
      : null;
    if (
      Number.isNaN(start.getTime()) ||
      (end && (Number.isNaN(end.getTime()) || end < start))
    ) {
      setError(
        "Bitte gültige Terminzeiten wählen. Das Ende muss nach dem Beginn liegen.",
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { offer, appointment } = appointmentEditor;
      await parseResponse(
        await fetch(
          appointment
            ? `/api/offers/${offer.id}/appointments/${appointment.id}`
            : `/api/offers/${offer.id}/appointments`,
          {
            method: appointment ? "PATCH" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...appointmentForm,
              starts_at: start.toISOString(),
              ends_at: end?.toISOString() ?? null,
            }),
          },
        ),
      );
      setAppointmentEditor(null);
      setNotice(
        appointment ? "Termin gespeichert." : "Nachfass-Termin angelegt.",
      );
      setMonth(appointmentForm.starts_at.slice(0, 7));
      setSelectedDay(appointmentForm.starts_at.slice(0, 10));
      setShowAll(false);
      await load(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Termin konnte nicht gespeichert werden.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function removeAppointment(
    offer: Offer,
    appointment: OfferAppointment,
  ) {
    if (
      demo ||
      busy ||
      !window.confirm(`Termin „${appointment.title}“ wirklich löschen?`)
    )
      return;
    setBusy(true);
    setError("");
    try {
      await parseResponse(
        await fetch(`/api/offers/${offer.id}/appointments/${appointment.id}`, {
          method: "DELETE",
        }),
      );
      setNotice("Termin gelöscht.");
      await load(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Termin konnte nicht gelöscht werden.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (demo || !editor || busy) return;
    const parsedDate = new Date(form.starts_at);
    if (Number.isNaN(parsedDate.getTime())) {
      setError("Bitte einen gültigen Termin wählen.");
      return;
    }
    if (
      form.recipient_email &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.recipient_email.trim())
    ) {
      setError("Bitte eine gültige E-Mail-Adresse eingeben.");
      return;
    }
    if (
      form.recipient_phone &&
      !/^\+[1-9]\d{6,14}$/.test(form.recipient_phone.trim())
    ) {
      setError("Bitte eine Mobilnummer im internationalen Format eingeben.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const isNew = editor === "new";
      await parseResponse(
        await fetch(isNew ? "/api/offers" : `/api/offers/${editor.id}`, {
          method: isNew ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...form,
            starts_at: parsedDate.toISOString(),
          }),
        }),
      );
      setEditor(null);
      setNotice(isNew ? "Angebot angelegt." : "Angebot gespeichert.");
      setMonth(form.starts_at.slice(0, 7));
      setSelectedDay(form.starts_at.slice(0, 10));
      setShowAll(false);
      await load(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Angebot konnte nicht gespeichert werden.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove(offer: Offer) {
    if (
      demo ||
      busy ||
      !window.confirm(`Angebot „${offer.title}“ wirklich löschen?`)
    )
      return;
    setBusy(true);
    setError("");
    try {
      await parseResponse(
        await fetch(`/api/offers/${offer.id}`, { method: "DELETE" }),
      );
      setNotice("Angebot gelöscht.");
      await load(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Angebot konnte nicht gelöscht werden.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function upload(offer: Offer, file?: File) {
    if (demo || !file || busy) return;
    if (offer.status !== "draft" && offer.status !== "ready") {
      setError(
        "Für bereits vorbereitete Angebote kann keine neue PDF hochgeladen werden.",
      );
      return;
    }
    const fileError = validateOfferPdf(file);
    if (fileError) {
      setError(fileError);
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const body = new FormData();
      body.set("file", file);
      await parseResponse(
        await fetch(`/api/offers/${offer.id}/pdf`, { method: "POST", body }),
      );
      setNotice("PDF hochgeladen.");
      await load(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "PDF konnte nicht hochgeladen werden.",
      );
    } finally {
      setBusy(false);
      setDraggingId(null);
      const input = fileInputs.current[offer.id];
      if (input) input.value = "";
    }
  }

  async function prepareDispatch(offer: Offer) {
    if (
      demo ||
      busy ||
      !dispatchReadiness?.ready ||
      !offer.pdf_name ||
      (offer.pdf_size ?? 0) > DISPATCH_MAX_BYTES ||
      !offer.recipient_email ||
      !offer.recipient_phone
    )
      return;
    setBusy(true);
    setError("");
    try {
      await parseResponse(
        await fetch(`/api/offers/${offer.id}/dispatch`, { method: "POST" }),
      );
      setNotice(
        "Der Versand wurde gestartet. Den Status beider Kanäle siehst du im Status-Tab.",
      );
      await load(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Versand konnte nicht gestartet werden.",
      );
    } finally {
      setBusy(false);
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>, offer: Offer) {
    event.preventDefault();
    setDraggingId(null);
    void upload(offer, event.dataTransfer.files[0]);
  }

  const [year, monthNumber] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const offset =
    (new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay() + 6) % 7;
  const calendarDays = Array.from(
    { length: Math.ceil((offset + daysInMonth) / 7) * 7 },
    (_, index) => {
      const day = index - offset + 1;
      return day > 0 && day <= daysInMonth
        ? `${month}-${String(day).padStart(2, "0")}`
        : null;
    },
  );
  const appointmentsByOffer = new Map<string, OfferAppointment[]>();
  for (const appointment of appointments) {
    const list = appointmentsByOffer.get(appointment.offer_id) ?? [];
    list.push(appointment);
    appointmentsByOffer.set(appointment.offer_id, list);
  }
  const offerHasDate = (offer: Offer, prefix: string) =>
    dayKey(offer.starts_at).startsWith(prefix) ||
    (appointmentsByOffer.get(offer.id) ?? []).some((appointment) =>
      dayKey(appointment.starts_at).startsWith(prefix),
    );
  const visibleOffers = offers.filter((offer) => offerHasDate(offer, month));
  const filteredOffers = (showAll ? offers : visibleOffers)
    .filter((offer) => !selectedDay || offerHasDate(offer, selectedDay))
    .filter((offer) =>
      `${offer.title} ${offer.customer_name} ${offer.notes ?? ""}`
        .toLocaleLowerCase("de-DE")
        .includes(query.toLocaleLowerCase("de-DE")),
    )
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const countByDay = new Map<string, number>();
  for (const offer of visibleOffers)
    countByDay.set(
      dayKey(offer.starts_at),
      (countByDay.get(dayKey(offer.starts_at)) ?? 0) + 1,
    );
  for (const appointment of appointments) {
    const date = dayKey(appointment.starts_at);
    if (date.startsWith(month))
      countByDay.set(date, (countByDay.get(date) ?? 0) + 1);
  }

  return (
    <div className={styles.workspace}>
      <section className={styles.intro}>
        <div>
          <span className={styles.eyebrow}>Angebotsmanager</span>
          <h2>Angebote versenden und nachverfolgen</h2>
          <p>
            Versende Angebots-PDFs per E-Mail und Superchat. Die Zustellung und
            Nachfassaktionen bleiben hier sichtbar.
          </p>
        </div>
        <button
          className={styles.primary}
          onClick={() => openEditor()}
          disabled={demo}
        >
          <Plus size={17} /> Angebot anlegen
        </button>
      </section>
      {demo && (
        <p className={styles.info}>
          Im Demo-Modus sind keine Angebote hinterlegt. Melde dich an, um
          Angebote anzulegen.
        </p>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className={styles.success} role="status">
          {notice}
        </p>
      )}
      <div
        className={styles.tabs}
        role="tablist"
        aria-label="Angebotsmanager Bereiche"
      >
        <button
          type="button"
          role="tab"
          id="offer-send-tab"
          aria-controls="offer-send-panel"
          aria-selected={tab === "send"}
          className={tab === "send" ? styles.activeTab : ""}
          onClick={() => {
            setTab("send");
            void checkDispatchReadiness();
          }}
        >
          Angebot versenden
        </button>
        <button
          type="button"
          role="tab"
          id="offer-status-tab"
          aria-controls="offer-status-panel"
          aria-selected={tab === "status"}
          className={tab === "status" ? styles.activeTab : ""}
          onClick={() => {
            setTab("status");
            void load(true);
          }}
        >
          Versendete Angebote / Status
        </button>
      </div>
      {tab === "send" && (
        <div
          id="offer-send-panel"
          role="tabpanel"
          aria-labelledby="offer-send-tab"
          className={styles.tabPanel}
        >
          <section
            className={styles.sendPanel}
            aria-labelledby="send-offer-title"
          >
            <div className={styles.sendHeading}>
              <div>
                <span className={styles.eyebrow}>Direktversand</span>
                <h3 id="send-offer-title">Angebot an Kunden senden</h3>
                <p>
                  Beide Empfängerangaben und eine PDF sind erforderlich. Der
                  Versand läuft über deinen angemeldeten Zugang
                  {ownerName ? ` (${ownerName})` : ""}.
                </p>
              </div>
              <Send size={22} aria-hidden="true" />
            </div>
            {!demo && !dispatchReadiness?.ready && (
              <div className={styles.readinessNotice} role="status">
                <div>
                  <strong>
                    {dispatchReadiness
                      ? "Versand noch nicht eingerichtet"
                      : "Versandverbindungen werden geprüft …"}
                  </strong>
                  {dispatchReadiness && <span>{dispatchReadiness.reason}</span>}
                </div>
                <button
                  type="button"
                  onClick={() => void checkDispatchReadiness()}
                >
                  Erneut prüfen
                </button>
              </div>
            )}
            <form className={styles.sendForm} onSubmit={sendNewOffer}>
              <div className={styles.sendFields}>
                <label>
                  Kundenname
                  <input
                    required
                    maxLength={120}
                    autoComplete="name"
                    value={sendForm.customer_name}
                    onChange={(event) =>
                      changeSendForm("customer_name", event.target.value)
                    }
                    placeholder="Vor- und Nachname"
                    disabled={demo || sendBusy}
                  />
                </label>
                <label>
                  E-Mail-Adresse
                  <input
                    required
                    type="email"
                    maxLength={254}
                    autoComplete="email"
                    value={sendForm.recipient_email}
                    onChange={(event) =>
                      changeSendForm("recipient_email", event.target.value)
                    }
                    placeholder="kunde@beispiel.de"
                    disabled={demo || sendBusy}
                  />
                </label>
                <label>
                  Mobilnummer für Superchat
                  <input
                    required
                    type="tel"
                    inputMode="tel"
                    maxLength={16}
                    autoComplete="tel"
                    value={sendForm.recipient_phone}
                    onChange={(event) =>
                      changeSendForm("recipient_phone", event.target.value)
                    }
                    placeholder="+491701234567"
                    disabled={demo || sendBusy}
                  />
                  <small>Mit Ländervorwahl, ohne Leerzeichen.</small>
                </label>
              </div>
              <div
                className={`${styles.sendDropZone} ${sendDragging ? styles.dragging : ""}`}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (!sendBusy) setSendDragging(true);
                }}
                onDragLeave={(event) => {
                  if (
                    !event.currentTarget.contains(event.relatedTarget as Node)
                  )
                    setSendDragging(false);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setSendDragging(false);
                  if (!sendBusy) selectSendFile(event.dataTransfer.files[0]);
                }}
              >
                <input
                  ref={sendFileInput}
                  type="file"
                  accept=".pdf,application/pdf"
                  className={styles.srOnly}
                  aria-label="Angebots-PDF auswählen"
                  onChange={(event) => selectSendFile(event.target.files?.[0])}
                  disabled={demo || sendBusy}
                />
                <UploadCloud size={22} aria-hidden="true" />
                <div>
                  <strong>
                    {sendFile?.name ?? "Angebots-PDF hier ablegen"}
                  </strong>
                  <span>
                    {sendFile
                      ? `${Math.ceil(sendFile.size / 1024)} KB · PDF`
                      : "PDF hierher ziehen oder auswählen · maximal 2,9 MB für den Versand"}
                  </span>
                </div>
                <button
                  type="button"
                  className={styles.cancel}
                  onClick={() => sendFileInput.current?.click()}
                  disabled={demo || sendBusy}
                >
                  PDF auswählen
                </button>
              </div>
              <div className={styles.sendActions}>
                <p>
                  Sobald deine Verbindungen bereit sind, werden E-Mail mit
                  PDF-Anhang und Superchat-Nachricht gemeinsam angestoßen. Den
                  tatsächlichen Status siehst du im zweiten Tab.
                </p>
                <button
                  type="submit"
                  className={styles.primary}
                  disabled={
                    demo || sendBusy || busy || !dispatchReadiness?.ready
                  }
                >
                  <Send size={16} />{" "}
                  {sendBusy ? "Versand läuft …" : "Angebot versenden"}
                </button>
              </div>
            </form>
          </section>
          <div className={styles.columns}>
            <section className={styles.calendar} aria-label="Angebotskalender">
              <div className={styles.calendarHeader}>
                <div>
                  <CalendarDays size={18} />
                  <h3>{monthTitle(month)}</h3>
                </div>
                <div className={styles.monthControls}>
                  <button
                    type="button"
                    aria-label="Vorheriger Monat"
                    onClick={() => {
                      setMonth(shiftMonth(month, -1));
                      setSelectedDay(null);
                      setShowAll(false);
                    }}
                  >
                    <ChevronLeft size={17} />
                  </button>
                  <button
                    type="button"
                    aria-label="Nächster Monat"
                    onClick={() => {
                      setMonth(shiftMonth(month, 1));
                      setSelectedDay(null);
                      setShowAll(false);
                    }}
                  >
                    <ChevronRight size={17} />
                  </button>
                </div>
              </div>
              <div className={styles.calendarGrid}>
                {weekdays.map((day) => (
                  <span key={day} className={styles.weekday}>
                    {day}
                  </span>
                ))}
                {calendarDays.map((date, index) =>
                  date ? (
                    <button
                      key={date}
                      type="button"
                      className={`${styles.day} ${selectedDay === date ? styles.selected : ""} ${date === dayKeyFormatter.format(new Date()) ? styles.today : ""}`}
                      aria-label={`${dateFormatter.format(new Date(`${date}T12:00:00Z`))}, ${countByDay.get(date) ?? 0} Termine`}
                      aria-pressed={selectedDay === date}
                      onClick={() => {
                        setShowAll(false);
                        setSelectedDay(selectedDay === date ? null : date);
                      }}
                    >
                      <span>{Number(date.slice(-2))}</span>
                      {(countByDay.get(date) ?? 0) > 0 && (
                        <small>{countByDay.get(date)}</small>
                      )}
                    </button>
                  ) : (
                    <span key={`empty-${index}`} className={styles.emptyDay} />
                  ),
                )}
              </div>
              <p className={styles.calendarHint}>
                Tag auswählen, um Termine zu filtern. Erneut klicken für den
                ganzen Monat.
              </p>
              {selectedDay && (
                <button
                  className={styles.textButton}
                  onClick={() => openEditor(undefined, selectedDay)}
                  disabled={demo}
                >
                  <Plus size={15} /> Angebot für diesen Tag anlegen
                </button>
              )}
            </section>
            <section
              className={styles.offers}
              aria-labelledby="offer-list-title"
            >
              <div className={styles.listHeader}>
                <div>
                  <span className={styles.eyebrow}>
                    {showAll
                      ? "Alle Angebote"
                      : selectedDay
                        ? dateFormatter.format(
                            new Date(`${selectedDay}T12:00:00Z`),
                          )
                        : monthTitle(month)}
                  </span>
                  <h3 id="offer-list-title">
                    Angebote <span>{filteredOffers.length}</span>
                  </h3>
                </div>
                <label className={styles.search}>
                  <Search size={16} />
                  <span className={styles.srOnly}>Angebote suchen</span>
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Angebote suchen"
                  />
                </label>
                <button
                  type="button"
                  className={styles.allOffersButton}
                  aria-pressed={showAll}
                  onClick={() => {
                    setShowAll(!showAll);
                    setSelectedDay(null);
                  }}
                >
                  {showAll ? "Monat zeigen" : "Alle zeigen"}
                </button>
              </div>
              {loading ? (
                <p className={styles.empty}>Angebote werden geladen…</p>
              ) : filteredOffers.length === 0 ? (
                <p className={styles.empty}>
                  {query
                    ? "Keine passenden Angebote gefunden."
                    : "Für diesen Zeitraum sind keine Angebote eingetragen."}
                </p>
              ) : (
                <div className={styles.offerList}>
                  {filteredOffers.map((offer) => (
                    <article className={styles.offerCard} key={offer.id}>
                      <div className={styles.offerTop}>
                        <div>
                          <span
                            className={`${styles.status} ${styles[offer.status] ?? ""}`}
                          >
                            {statusLabel(offer.status)}
                          </span>
                          <h4>{offer.title}</h4>
                          <p>{offer.customer_name}</p>
                        </div>
                        <div className={styles.cardActions}>
                          <button
                            type="button"
                            aria-label={`${offer.title} bearbeiten`}
                            title="Bearbeiten"
                            onClick={() => openEditor(offer)}
                            disabled={demo || busy}
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            type="button"
                            aria-label={`${offer.title} löschen`}
                            title="Löschen"
                            onClick={() => void remove(offer)}
                            disabled={demo || busy}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                      <p className={styles.appointment}>
                        <CalendarDays size={15} /> Angebotstermin:{" "}
                        {dateFormatter.format(new Date(offer.starts_at))} ·{" "}
                        {timeFormatter.format(new Date(offer.starts_at))} Uhr
                      </p>
                      {offer.notes && (
                        <p className={styles.notes}>{offer.notes}</p>
                      )}
                      <div className={styles.appointmentSection}>
                        <div className={styles.appointmentSectionHeader}>
                          <strong>Weitere Termine & Nachfassen</strong>
                          <button
                            type="button"
                            onClick={() => openAppointmentEditor(offer)}
                            disabled={demo || busy}
                          >
                            <Plus size={14} /> Termin
                          </button>
                        </div>
                        {(appointmentsByOffer.get(offer.id) ?? []).length ===
                        0 ? (
                          <p className={styles.appointmentEmpty}>
                            Noch keine weiteren Termine.
                          </p>
                        ) : (
                          <div className={styles.appointmentList}>
                            {(appointmentsByOffer.get(offer.id) ?? []).map(
                              (appointment) => (
                                <div
                                  className={styles.appointmentRow}
                                  key={appointment.id}
                                >
                                  <div>
                                    <strong>{appointment.title}</strong>
                                    <span>
                                      {dateFormatter.format(
                                        new Date(appointment.starts_at),
                                      )}{" "}
                                      ·{" "}
                                      {timeFormatter.format(
                                        new Date(appointment.starts_at),
                                      )}{" "}
                                      Uhr
                                      {appointmentEndLabel(appointment)}
                                    </span>
                                    {appointment.notes && (
                                      <small>{appointment.notes}</small>
                                    )}
                                  </div>
                                  <div className={styles.appointmentActions}>
                                    <button
                                      type="button"
                                      aria-label={`${appointment.title} bearbeiten`}
                                      title="Termin bearbeiten"
                                      onClick={() =>
                                        openAppointmentEditor(
                                          offer,
                                          appointment,
                                        )
                                      }
                                      disabled={demo || busy}
                                    >
                                      <Pencil size={14} />
                                    </button>
                                    <button
                                      type="button"
                                      aria-label={`${appointment.title} löschen`}
                                      title="Termin löschen"
                                      onClick={() =>
                                        void removeAppointment(
                                          offer,
                                          appointment,
                                        )
                                      }
                                      disabled={demo || busy}
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                </div>
                              ),
                            )}
                          </div>
                        )}
                      </div>
                      <div
                        className={`${styles.dropZone} ${draggingId === offer.id ? styles.dragging : ""}`}
                        onDragOver={(event) => {
                          event.preventDefault();
                          if (!busy) setDraggingId(offer.id);
                        }}
                        onDragLeave={(event) => {
                          if (
                            !event.currentTarget.contains(
                              event.relatedTarget as Node,
                            )
                          )
                            setDraggingId(null);
                        }}
                        onDrop={(event) => onDrop(event, offer)}
                      >
                        <input
                          ref={(node) => {
                            fileInputs.current[offer.id] = node;
                          }}
                          type="file"
                          accept=".pdf,application/pdf"
                          className={styles.srOnly}
                          aria-label={`PDF für ${offer.title} auswählen`}
                          onChange={(event) =>
                            void upload(offer, event.target.files?.[0])
                          }
                        />
                        <FileText size={19} />
                        <div>
                          <strong>
                            {offer.pdf_name ?? "Angebots-PDF ablegen"}
                          </strong>
                          <small>
                            {offer.pdf_name
                              ? `${Math.ceil((offer.pdf_size ?? 0) / 1024)} KB · PDF`
                              : "PDF hierher ziehen oder auswählen"}
                          </small>
                        </div>
                        <button
                          type="button"
                          onClick={() => fileInputs.current[offer.id]?.click()}
                          disabled={
                            demo ||
                            busy ||
                            !dispatchReadiness?.ready ||
                            (offer.status !== "draft" &&
                              offer.status !== "ready")
                          }
                          aria-label={`PDF für ${offer.title} hochladen`}
                        >
                          <UploadCloud size={17} />
                        </button>
                        {offer.pdf_name && (
                          <a
                            href={`/api/offers/${offer.id}/pdf`}
                            aria-label={`PDF für ${offer.title} herunterladen`}
                            title="PDF herunterladen"
                          >
                            <Download size={17} />
                          </a>
                        )}
                      </div>
                      <div className={styles.offerFooter}>
                        <div className={styles.channels}>
                          <span
                            className={
                              offer.recipient_email ? styles.connected : ""
                            }
                          >
                            E-Mail{" "}
                            {offer.recipient_email ? "vorhanden" : "fehlt"}
                          </span>
                          <span
                            className={
                              offer.recipient_phone ? styles.connected : ""
                            }
                          >
                            Mobilnummer{" "}
                            {offer.recipient_phone ? "vorhanden" : "fehlt"}
                          </span>
                        </div>
                        <button
                          type="button"
                          className={styles.prepare}
                          disabled={
                            demo ||
                            busy ||
                            !offer.pdf_name ||
                            (offer.pdf_size ?? 0) > DISPATCH_MAX_BYTES ||
                            !offer.recipient_email ||
                            !offer.recipient_phone ||
                            deliveries.some(
                              (delivery) => delivery.offer_id === offer.id,
                            ) ||
                            offer.status === "pending_connection" ||
                            offer.status === "sent"
                          }
                          onClick={() => void prepareDispatch(offer)}
                        >
                          <Send size={14} /> Angebot versenden
                        </button>
                      </div>
                      {offer.status !== "pending_connection" &&
                        offer.status !== "sent" &&
                        (!offer.pdf_name ||
                          (offer.pdf_size ?? 0) > DISPATCH_MAX_BYTES ||
                          !offer.recipient_email ||
                          !offer.recipient_phone) && (
                          <p className={styles.requirement}>
                            Für den Versand werden eine PDF bis 2,9 MB,
                            E-Mail-Adresse und Mobilnummer benötigt.
                          </p>
                        )}
                      {offer.status === "pending_connection" && (
                        <p className={styles.requirement}>
                          Verbindung ausstehend. Es wurde noch nichts an den
                          Kunden gesendet.
                        </p>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      )}
      {tab === "status" && (
        <section
          id="offer-status-panel"
          role="tabpanel"
          aria-labelledby="offer-status-tab"
          className={styles.statusPanel}
        >
          <div className={styles.statusHeading}>
            <div>
              <span className={styles.eyebrow}>Versandübersicht</span>
              <h3>Versendete Angebote / Status</h3>
            </div>
            <button
              type="button"
              className={styles.cancel}
              onClick={() => void load(true)}
              disabled={loading}
            >
              Aktualisieren
            </button>
          </div>
          {!demo && !dispatchReadiness?.ready && (
            <div className={styles.readinessNotice} role="status">
              <div>
                <strong>Erneuter Versand noch nicht verfügbar</strong>
                <span>
                  {dispatchReadiness?.reason ??
                    "Versandverbindungen werden geprüft …"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => void checkDispatchReadiness()}
              >
                Erneut prüfen
              </button>
            </div>
          )}
          {loading ? (
            <p className={styles.empty}>Status wird geladen …</p>
          ) : offers.filter((offer) =>
              deliveries.some((delivery) => delivery.offer_id === offer.id),
            ).length === 0 ? (
            <p className={styles.empty}>
              Noch keine versendeten Angebote vorhanden.
            </p>
          ) : (
            <div className={styles.tableScroll}>
              <table className={styles.statusTable}>
                <thead>
                  <tr>
                    <th>Angebot / Empfänger</th>
                    <th>Besitzer</th>
                    <th>PDF</th>
                    <th>Versand angenommen am</th>
                    <th>E-Mail</th>
                    <th>Superchat</th>
                  </tr>
                </thead>
                <tbody>
                  {offers
                    .filter((offer) =>
                      deliveries.some(
                        (delivery) => delivery.offer_id === offer.id,
                      ),
                    )
                    .map((offer) => {
                      const offerDeliveries = deliveries.filter(
                        (delivery) => delivery.offer_id === offer.id,
                      );
                      const sentAt = offerDeliveries
                        .map((delivery) => delivery.sent_at)
                        .filter((value): value is string => Boolean(value))
                        .sort()[0];
                      return (
                        <tr key={offer.id}>
                          <td>
                            <strong>{offer.customer_name}</strong>
                            <span>{offer.title}</span>
                            <small>
                              {offer.recipient_email ?? "Keine E-Mail"}
                              <br />
                              {offer.recipient_phone ?? "Keine Mobilnummer"}
                            </small>
                          </td>
                          <td>
                            <strong>{ownerName || "Du"}</strong>
                            {ownerEmail && <small>{ownerEmail}</small>}
                          </td>
                          <td>
                            {offer.pdf_name ? (
                              <a href={`/api/offers/${offer.id}/pdf`}>
                                <FileText size={14} /> {offer.pdf_name}
                              </a>
                            ) : (
                              "–"
                            )}
                          </td>
                          <td>{dateTimeLabel(sentAt)}</td>
                          {(["email", "superchat"] as const).map((channel) => {
                            const delivery = offerDeliveries.find(
                              (item) => item.channel === channel,
                            );
                            return (
                              <td key={channel}>
                                {delivery ? (
                                  <div className={styles.deliveryCell}>
                                    <span
                                      className={`${styles.deliveryBadge} ${delivery.state === "failed" ? styles.deliveryFailed : delivery.state === "unknown" ? styles.deliveryUnknown : ""}`}
                                    >
                                      {deliveryLabel(delivery.state)}
                                    </span>
                                    {delivery.last_error && (
                                      <small className={styles.deliveryReason}>
                                        {delivery.last_error}
                                      </small>
                                    )}
                                    {delivery.state === "unknown" && (
                                      <small className={styles.deliveryReason}>
                                        Status beim Anbieter prüfen, bevor du
                                        erneut sendest.
                                      </small>
                                    )}
                                    {delivery.state === "failed" && (
                                      <button
                                        type="button"
                                        className={styles.retry}
                                        disabled={
                                          demo ||
                                          busy ||
                                          sendBusy ||
                                          !dispatchReadiness?.ready
                                        }
                                        onClick={() =>
                                          void retryDelivery(offer, channel)
                                        }
                                      >
                                        Erneut versuchen
                                      </button>
                                    )}
                                  </div>
                                ) : (
                                  <span className={styles.muted}>
                                    Noch kein Versand
                                  </span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
      {editor && (
        <div
          className={styles.backdrop}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) setEditor(null);
          }}
        >
          <section
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="offer-dialog-title"
          >
            <div className={styles.dialogHeader}>
              <div>
                <span className={styles.eyebrow}>Angebotsmanager</span>
                <h2 id="offer-dialog-title">
                  {editor === "new" ? "Angebot anlegen" : "Angebot bearbeiten"}
                </h2>
              </div>
              <button
                type="button"
                aria-label="Schließen"
                onClick={() => setEditor(null)}
                disabled={busy}
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={save} className={styles.form}>
              <label>
                Titel
                <input
                  required
                  maxLength={120}
                  value={form.title}
                  onChange={(event) =>
                    setForm({ ...form, title: event.target.value })
                  }
                  placeholder="z. B. Rechtsschutzangebot"
                />
              </label>
              <label>
                Kunde
                <input
                  required
                  maxLength={120}
                  value={form.customer_name}
                  onChange={(event) =>
                    setForm({ ...form, customer_name: event.target.value })
                  }
                  placeholder="Name des Kunden"
                />
              </label>
              <label>
                Angebotstermin
                <input
                  required
                  type="datetime-local"
                  value={form.starts_at}
                  onChange={(event) =>
                    setForm({ ...form, starts_at: event.target.value })
                  }
                />
              </label>
              <label>
                Notizen
                <textarea
                  rows={3}
                  maxLength={1000}
                  value={form.notes}
                  onChange={(event) =>
                    setForm({ ...form, notes: event.target.value })
                  }
                  placeholder="Wichtige Punkte zum Angebot"
                />
              </label>
              <div className={styles.formColumns}>
                <label>
                  E-Mail-Adresse <span>(optional)</span>
                  <input
                    type="email"
                    maxLength={254}
                    value={form.recipient_email}
                    onChange={(event) =>
                      setForm({ ...form, recipient_email: event.target.value })
                    }
                    placeholder="kunde@beispiel.de"
                  />
                </label>
                <label>
                  Mobilnummer für Superchat <span>(optional)</span>
                  <input
                    type="tel"
                    maxLength={16}
                    value={form.recipient_phone}
                    onChange={(event) =>
                      setForm({ ...form, recipient_phone: event.target.value })
                    }
                    placeholder="+491701234567"
                  />
                </label>
              </div>
              <div className={styles.formColumns}>
                <label>
                  HubSpot Kontakt-ID <span>(optional)</span>
                  <input
                    maxLength={120}
                    value={form.hubspot_contact_id}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        hubspot_contact_id: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Superchat Kontakt-ID <span>(optional)</span>
                  <input
                    maxLength={120}
                    value={form.superchat_contact_id}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        superchat_contact_id: event.target.value,
                      })
                    }
                  />
                </label>
              </div>
              <p className={styles.formHint}>
                Kontakt-IDs sind optional. Das Speichern sendet keine Nachricht.
              </p>
              {error && (
                <p className={styles.error} role="alert">
                  {error}
                </p>
              )}
              <div className={styles.formActions}>
                <button
                  type="button"
                  className={styles.cancel}
                  onClick={() => setEditor(null)}
                  disabled={busy}
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  className={styles.primary}
                  disabled={busy}
                >
                  {busy ? "Speichert…" : "Angebot speichern"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {appointmentEditor && (
        <div
          className={styles.backdrop}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy)
              setAppointmentEditor(null);
          }}
        >
          <section
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="appointment-dialog-title"
          >
            <div className={styles.dialogHeader}>
              <div>
                <span className={styles.eyebrow}>
                  {appointmentEditor.offer.customer_name}
                </span>
                <h2 id="appointment-dialog-title">
                  {appointmentEditor.appointment
                    ? "Termin bearbeiten"
                    : "Termin hinzufügen"}
                </h2>
              </div>
              <button
                type="button"
                aria-label="Schließen"
                onClick={() => setAppointmentEditor(null)}
                disabled={busy}
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={saveAppointment} className={styles.form}>
              <label>
                Bezeichnung
                <input
                  required
                  maxLength={120}
                  value={appointmentForm.title}
                  onChange={(event) =>
                    setAppointmentForm({
                      ...appointmentForm,
                      title: event.target.value,
                    })
                  }
                  placeholder="z. B. Nachfassen"
                />
              </label>
              <div className={styles.formColumns}>
                <label>
                  Beginn
                  <input
                    required
                    type="datetime-local"
                    value={appointmentForm.starts_at}
                    onChange={(event) =>
                      setAppointmentForm({
                        ...appointmentForm,
                        starts_at: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Ende <span>(optional)</span>
                  <input
                    type="datetime-local"
                    value={appointmentForm.ends_at}
                    onChange={(event) =>
                      setAppointmentForm({
                        ...appointmentForm,
                        ends_at: event.target.value,
                      })
                    }
                  />
                </label>
              </div>
              <label>
                Notizen <span>(optional)</span>
                <textarea
                  rows={3}
                  maxLength={500}
                  value={appointmentForm.notes}
                  onChange={(event) =>
                    setAppointmentForm({
                      ...appointmentForm,
                      notes: event.target.value,
                    })
                  }
                  placeholder="Gesprächsziel oder nächster Schritt"
                />
              </label>
              {error && (
                <p className={styles.error} role="alert">
                  {error}
                </p>
              )}
              <div className={styles.formActions}>
                <button
                  type="button"
                  className={styles.cancel}
                  onClick={() => setAppointmentEditor(null)}
                  disabled={busy}
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  className={styles.primary}
                  disabled={busy}
                >
                  {busy ? "Speichert…" : "Termin speichern"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
