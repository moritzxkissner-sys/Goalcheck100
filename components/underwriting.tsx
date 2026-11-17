"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { ShieldCheck, Send, Clock, CheckCircle2 } from "lucide-react";
import {
  loadUnderwriting,
  prepareUnderwritingUpload,
  createUnderwriting,
  underwritingDetails,
  updateUnderwriting,
  commentUnderwriting,
  downloadUnderwriting,
} from "@/app/underwriting-actions";
import {
  underwritingSchema,
  underwritingStats,
  underwritingStatuses,
  validateUnderwritingFile,
  type UnderwritingRequest,
  type UnderwritingAttachment,
  type UnderwritingEvent,
} from "@/lib/underwriting";
import GoaltrackDialog from "./goaltrack-dialog";
import styles from "./sales-underwriting.module.css";
const date = (s: string) =>
  new Intl.DateTimeFormat("de-DE", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  }).format(new Date(s));
export default function Underwriting({
  demo = false,
  customers = [],
}: {
  demo?: boolean;
  customers?: string[];
}) {
  const [customerOptions, setCustomerOptions] = useState<string[]>(customers);
  const [rows, setRows] = useState<UnderwritingRequest[]>([]),
    [tab, setTab] = useState("Alle"),
    [status, setStatus] = useState("Alle"),
    [search, setSearch] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [customer, setCustomer] = useState("");
  const [files, setFiles] = useState<File[]>([]),
    [length, setLength] = useState(0),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(!demo);
  const [selected, setSelected] = useState<UnderwritingRequest | null>(null),
    [attachments, setAttachments] = useState<UnderwritingAttachment[]>([]),
    [events, setEvents] = useState<UnderwritingEvent[]>([]);
  const requestId = useRef("");
  const uploaded = useRef(
    new Map<File, Omit<UnderwritingAttachment, "id" | "request_id">>(),
  );
  const formRef = useRef<HTMLFormElement>(null);
  const lock = useRef(false);
  async function reload() {
    if (demo) return;
    const result = await loadUnderwriting();
    if (result.error) setError(result.error);
    else {
      setRows(result.rows);
      setCustomerOptions(result.customers);
    }
    setLoading(false);
  }
  useEffect(() => {
    if (demo) return;
    let active = true;
    void loadUnderwriting().then((r) => {
      if (!active) return;
      if (r.error) setError(r.error);
      else {
        setRows(r.rows);
        setCustomerOptions(r.customers);
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [demo]);
  const stats = underwritingStats(rows);
  const filtered = rows.filter(
    (r) =>
      (tab === "Alle" || r.department === tab) &&
      (status === "Alle" || r.status === status) &&
      (!from ||
        new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(
          new Date(r.created_at),
        ) >= from) &&
      (!to ||
        new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(
          new Date(r.created_at),
        ) <= to) &&
      r.customer_name
        .toLocaleLowerCase("de")
        .includes(customer.toLocaleLowerCase("de")) &&
      `${r.id} ${r.subject} ${r.customer_name} ${r.message}`
        .toLocaleLowerCase("de")
        .includes(search.toLocaleLowerCase("de")),
  );
  function chooseFiles(incoming: File[]) {
    const combined = [...files, ...incoming];
    const problem = combined.map(validateUnderwritingFile).find(Boolean);
    if (problem || combined.length > 5) {
      setError(problem ?? "Maximal fünf Anhänge pro Anfrage.");
      return;
    }
    setFiles(combined);
    setError("");
  }
  function reset() {
    formRef.current?.reset();
    setLength(0);
    setFiles([]);
    uploaded.current.clear();
    requestId.current = "";
    setError("");
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (lock.current) return;
    setError("");
    setNotice("");
    const data = new FormData(e.currentTarget);
    requestId.current ||= crypto.randomUUID();
    const input = {
      id: requestId.current,
      department: data.get("department"),
      customer_name: data.get("customer_name"),
      subject: data.get("subject"),
      message: data.get("message"),
      attachments: [],
    };
    const parsed = underwritingSchema.safeParse(input);
    if (!parsed.success) {
      setError(
        "Bitte Fachbereich, Kunde, Betreff und Nachricht (maximal 1.000 Zeichen) prüfen.",
      );
      return;
    }
    lock.current = true;
    setBusy(true);
    try {
      if (demo) {
        setRows((old) => [
          {
            ...parsed.data,
            user_id: "demo",
            creator_name: "Demo-Partner",
            status: "open",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            completed_at: null,
          },
          ...old,
        ]);
      } else {
        const attachments = [];
        for (const file of files) {
          let meta = uploaded.current.get(file);
          if (!meta) {
            const signed = await prepareUnderwritingUpload(
              { name: file.name, size: file.size, type: file.type },
              requestId.current,
            );
            if ("error" in signed) throw new Error(signed.error);
            const client = createBrowserClient(
              process.env.NEXT_PUBLIC_SUPABASE_URL!,
              process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
            );
            const result = await client.storage
              .from("underwriting")
              .uploadToSignedUrl(signed.path, signed.token, file, {
                contentType: file.type,
              });
            if (result.error)
              throw new Error(
                `Upload fehlgeschlagen: ${file.name}. Die Anfrage wurde noch nicht gespeichert.`,
              );
            meta = {
              path: signed.path,
              name: file.name,
              size: file.size,
              type: file.type as UnderwritingAttachment["type"],
            };
            uploaded.current.set(file, meta);
          }
          attachments.push(meta);
        }
        const result = await createUnderwriting({
          ...parsed.data,
          attachments,
        });
        if ("error" in result) throw new Error(result.error);
        await reload();
      }
      reset();
      setNotice(
        demo
          ? "Demo-Anfrage gespeichert; Anhänge werden im Demo-Modus nicht hochgeladen."
          : "Anfrage intern gespeichert. Steven kann sie jetzt bearbeiten.",
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Speichern fehlgeschlagen.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function open(row: UnderwritingRequest) {
    setError("");
    setAttachments([]);
    setEvents([]);
    if (!demo) {
      const result = await underwritingDetails(row.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      setAttachments(result.attachments);
      setEvents(result.events);
    }
    setSelected(row);
  }
  async function saveDetails(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected || lock.current) return;
    const data = new FormData(e.currentTarget);
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const input = {
        id: selected.id,
        department: data.get("department"),
        customer_name: data.get("customer_name"),
        subject: data.get("subject"),
        message: data.get("message"),
      };
      if (
        !underwritingSchema.omit({ attachments: true }).safeParse(input).success
      )
        throw new Error("Bitte alle Pflichtfelder prüfen.");
      const value = data.get("status") as UnderwritingRequest["status"];
      if (demo) {
        const next = {
          ...selected,
          ...input,
          status: value,
          completed_at: value === "completed" ? new Date().toISOString() : null,
        } as UnderwritingRequest;
        setRows((old) => old.map((r) => (r.id === next.id ? next : r)));
        setSelected(next);
      } else {
        const result = await updateUnderwriting(input, value);
        if ("error" in result) throw new Error(result.error);
        await reload();
        setSelected(null);
      }
      setNotice("Anfrage aktualisiert.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Speichern fehlgeschlagen.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function comment(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected || lock.current) return;
    const form = e.currentTarget,
      note = String(new FormData(form).get("note") ?? "").trim();
    if (!note) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      if (demo)
        setEvents((old) => [
          ...old,
          {
            id: crypto.randomUUID(),
            request_id: selected.id,
            user_id: "demo",
            author_name: "Demo-Partner",
            note,
            created_at: new Date().toISOString(),
          },
        ]);
      else {
        const r = await commentUnderwriting(selected.id, note);
        if ("error" in r) throw new Error(r.error);
        const details = await underwritingDetails(selected.id);
        if (details.error) throw new Error(details.error);
        setEvents(details.events);
      }
      form.reset();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Rückmeldung fehlgeschlagen.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section className={styles.workspace} aria-label="Underwriting">
      <div className={styles.stats}>
        <div>
          <Send size={20} /> Offene Anfragen<strong>{stats.open}</strong>
        </div>
        <div>
          <CheckCircle2 size={20} /> Erledigt (30 Tage)
          <strong>{stats.completed}</strong>
        </div>
        <div>
          <Clock size={20} /> Ø Bearbeitungszeit (30 Tage)
          <strong>
            {stats.averageDays === null
              ? "—"
              : `${stats.averageDays.toLocaleString("de-DE", { maximumFractionDigits: 1 })} Tage`}
          </strong>
        </div>
      </div>
      <div className={styles.tabs} aria-label="Fachbereich">
        {["Alle", "Rechtsschutz", "SHU"].map((t) => (
          <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>
            {t === "Alle" ? "Übersicht" : t}
          </button>
        ))}
      </div>
      {error && !selected && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <div className={styles.columns}>
        <section className={styles.card}>
          <h2>
            <ShieldCheck size={22} /> Neue Underwriting-Anfrage
          </h2>
          <p className={styles.muted}>
            Interne Anfrage an Rechtsschutz oder SHU (Sach / Haftpflicht /
            Unfall).
          </p>
          <form ref={formRef} onSubmit={submit}>
            <label>
              Fachabteilung
              <select aria-label="Fachabteilung" name="department" required>
                <option>Rechtsschutz</option>
                <option>SHU</option>
              </select>
            </label>
            <label>
              Kunde / Interessent
              <input
                name="customer_name"
                list="underwriting-customers"
                placeholder="Kunden suchen oder Namen eingeben …"
                required
                maxLength={120}
              />
            </label>
            <datalist id="underwriting-customers">
              {[
                ...new Set([
                  ...customerOptions,
                  ...rows.map((r) => r.customer_name),
                ]),
              ].map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <label>
              Betreff
              <input
                name="subject"
                required
                maxLength={180}
                placeholder="z. B. Risikovoranfrage"
              />
            </label>
            <label>
              Nachricht / Anfrage
              <textarea
                aria-label="Nachricht / Anfrage"
                name="message"
                required
                maxLength={1000}
                onChange={(e) => setLength(e.target.value.length)}
              />
              <span className={styles.muted}>{length} / 1.000 Zeichen</span>
            </label>
            <div
              className={styles.dropzone}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (!busy) chooseFiles(Array.from(e.dataTransfer.files));
              }}
            >
              <label>
                Anhänge: PDF, JPG, PNG · je max. 10 MB
                <input
                  type="file"
                  multiple
                  disabled={busy}
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(e) => {
                    chooseFiles(Array.from(e.target.files ?? []));
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            {files.map((f, i) => (
              <div className={styles.actions} key={`${f.name}-${i}`}>
                <span>
                  {f.name} · {(f.size / 1024 / 1024).toFixed(2)} MB
                </span>
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`${f.name} entfernen`}
                  onClick={() =>
                    setFiles((old) => old.filter((_, j) => j !== i))
                  }
                >
                  Entfernen
                </button>
              </div>
            ))}
            <div className={styles.actions}>
              <button type="button" disabled={busy} onClick={reset}>
                Zurücksetzen
              </button>
              <button className="primary" disabled={busy}>
                {busy ? "Wird gespeichert …" : "Anfrage senden"}
              </button>
            </div>
          </form>
        </section>
        <section className={styles.card}>
          <h2>Anfragen – Übersicht</h2>
          <div className={styles.filters}>
            <input
              aria-label="Anfragen durchsuchen"
              placeholder="Anfragen suchen …"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              aria-label="Status filtern"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="Alle">Alle Status</option>
              {Object.entries(underwritingStatuses).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <input
              aria-label="Kunde filtern"
              placeholder="Kunde filtern"
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
            />
            <label>
              Von
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label>
              Bis
              <input
                type="date"
                min={from}
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
            <button onClick={() => void reload()} disabled={loading || busy}>
              Aktualisieren
            </button>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  {[
                    "Anfrage-ID",
                    "Betreff",
                    "Fachbereich",
                    "Kunde",
                    "Status",
                    "Eingang",
                    "Aktionen",
                  ].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td title={r.id}>UW-{r.id.slice(0, 8)}</td>
                    <td>
                      <button onClick={() => void open(r)}>{r.subject}</button>
                    </td>
                    <td>{r.department}</td>
                    <td>{r.customer_name}</td>
                    <td>
                      <span className={styles.badge} data-status={r.status}>
                        {underwritingStatuses[r.status]}
                      </span>
                    </td>
                    <td>{date(r.created_at)}</td>
                    <td>
                      <button onClick={() => void open(r)}>Öffnen</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!filtered.length && (
            <p>
              {loading
                ? "Anfragen werden geladen …"
                : "Keine passenden Anfragen vorhanden."}
            </p>
          )}
        </section>
      </div>
      {selected && (
        <GoaltrackDialog
          title="Underwriting-Anfrage"
          onClose={() => {
            if (!busy) {
              setSelected(null);
              setError("");
            }
          }}
        >
          <div className={styles.details}>
            <p className={styles.muted}>
              ID: {selected.id}
              <br />
              Erstellt: {date(selected.created_at)} · {selected.creator_name}
              <br />
              Aktualisiert: {date(selected.updated_at)}
            </p>
            {error && (
              <p role="alert" className={styles.error}>
                {error}
              </p>
            )}
            <form onSubmit={saveDetails} className={styles.details}>
              <label>
                Fachabteilung
                <select
                  aria-label="Fachabteilung"
                  name="department"
                  defaultValue={selected.department}
                >
                  <option>Rechtsschutz</option>
                  <option>SHU</option>
                </select>
              </label>
              <label>
                Kunde
                <input
                  name="customer_name"
                  defaultValue={selected.customer_name}
                  required
                  maxLength={120}
                />
              </label>
              <label>
                Betreff
                <input
                  name="subject"
                  defaultValue={selected.subject}
                  required
                  maxLength={180}
                />
              </label>
              <label>
                Nachricht
                <textarea
                  aria-label="Nachricht"
                  name="message"
                  defaultValue={selected.message}
                  required
                  maxLength={1000}
                />
              </label>
              <label>
                Status
                <select
                  aria-label="Status"
                  name="status"
                  defaultValue={selected.status}
                >
                  {Object.entries(underwritingStatuses).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <button className="primary" disabled={busy}>
                Änderungen speichern
              </button>
            </form>
            <h3>Anhänge ({attachments.length})</h3>
            <div className={styles.attachments}>
              {attachments.map((a) => (
                <button
                  key={a.id}
                  className="secondary"
                  disabled={busy}
                  onClick={async () => {
                    const result = await downloadUnderwriting(a.id);
                    if ("error" in result) setError(result.error);
                    else if (result.url) window.location.assign(result.url);
                  }}
                >
                  {a.name} · {(a.size / 1024 / 1024).toFixed(2)} MB
                  herunterladen
                </button>
              ))}
            </div>
            <h3>Bearbeitungsverlauf und Rückmeldungen</h3>
            {events.map((e) => (
              <div className={styles.history} key={e.id}>
                <strong>{e.author_name}</strong>{" "}
                <small>{date(e.created_at)}</small>
                <p>{e.note}</p>
              </div>
            ))}
            <form onSubmit={comment} className={styles.details}>
              <label>
                Kommentar / Rückmeldung
                <textarea name="note" required maxLength={1000} />
              </label>
              <button className="primary" disabled={busy}>
                Rückmeldung speichern
              </button>
            </form>
          </div>
        </GoaltrackDialog>
      )}
    </section>
  );
}
