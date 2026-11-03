"use client";
import { useState, type FormEvent } from "react";
import { academyTracks } from "@/lib/academy";
import { type QuestionDraft } from "@/lib/academy-documents";
import { type TrainingDocument } from "@/lib/training-documents";
import styles from "./reference-panels.module.css";
import draftStyles from "./academy-question-drafts.module.css";
const labels: Record<string, string> = {
  draft: "Entwurf",
  review_pending: "In Prüfung",
  approved: "Freigegeben",
  rejected: "Abgelehnt",
};
export default function AcademyQuestionDrafts({
  document,
}: {
  document: TrainingDocument;
}) {
  const [editing, setEditing] = useState<QuestionDraft | null>(null);
  const [open, setOpen] = useState(false),
    [drafts, setDrafts] = useState<QuestionDraft[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [loaded, setLoaded] = useState(false);
  async function load() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(
        `/api/academy-question-drafts?document_id=${document.id}`,
        { cache: "no-store" },
      );
      const b = await r.json();
      if (!r.ok) throw new Error(b.error);
      setDrafts(b.drafts);
      setLoaded(true);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Laden fehlgeschlagen.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function persist(value: unknown, update = false) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/academy-question-drafts", {
        method: update ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(value),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error);
      await load();
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Speichern fehlgeschlagen.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget,
      data = new FormData(form);
    const choices = String(data.get("choices"))
      .split("\n")
      .map((v) => v.trim())
      .filter(Boolean);
    const correct_indices = String(data.get("correct"))
      .split(",")
      .map((v) => Number(v.trim()) - 1);
    if (
      await persist(
        {
          document_id: document.id,
          document_version: document.document_version,
          citation: data.get("citation"),
          prompt: data.get("prompt"),
          choices,
          correct_indices,
          explanation: data.get("explanation"),
          module_id: data.get("module_id"),
          status: "draft",
          ...(editing ? { id: editing.id } : {}),
        },
        !!editing,
      )
    ) {
      form.reset();
      setEditing(null);
    }
  }
  return (
    <div className={draftStyles.drafts}>
      <button
        className={styles.button}
        type="button"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
          if (!open && !loaded) void load();
        }}
      >
        Fragenentwürfe {open ? "schließen" : "öffnen"}
      </button>
      {open && (
        <section aria-label="Manuelle Fragenentwürfe">
          <h3>Manueller Fragenentwurf / KI noch nicht eingerichtet</h3>
          <p className={styles.hint}>
            Quelle: {document.title} · Version {document.document_version}. Es
            werden keine Fragen automatisch erzeugt. Freigegebene Entwürfe
            werden für eine spätere Übernahme vorbereitet; sie erscheinen noch
            nicht im Lernquiz.
          </p>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <form
            key={editing?.id ?? "new"}
            onSubmit={create}
            className={styles.form}
          >
            <h4>{editing ? "Entwurf bearbeiten" : "Neuer Fragenentwurf"}</h4>
            <label>
              Modul
              <select
                className={styles.input}
                name="module_id"
                defaultValue={editing?.module_id ?? document.module_id ?? ""}
                required
              >
                <option value="">Modul auswählen</option>
                {academyTracks.map((track) => (
                  <optgroup key={track.id} label={track.title}>
                    {track.modules.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.title}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <label>
              Textbeleg und Seite
              <textarea
                className={styles.input}
                name="citation"
                defaultValue={editing?.citation}
                required
                maxLength={2000}
                rows={3}
              />
            </label>
            <label>
              Frage
              <textarea
                className={styles.input}
                name="prompt"
                defaultValue={editing?.prompt}
                required
                maxLength={1000}
                rows={2}
              />
            </label>
            <label>
              Antworten (2–6, eine pro Zeile)
              <textarea
                className={styles.input}
                name="choices"
                defaultValue={editing?.choices.join("\n")}
                required
                maxLength={3005}
                rows={4}
              />
            </label>
            <label>
              Richtige Antwortnummern (z. B. 1,3)
              <input
                className={styles.input}
                name="correct"
                defaultValue={editing?.correct_indices
                  .map((i) => i + 1)
                  .join(",")}
                required
                pattern="[1-6](\s*,\s*[1-6])*"
              />
            </label>
            <label>
              Erklärung
              <textarea
                className={styles.input}
                name="explanation"
                defaultValue={editing?.explanation}
                required
                maxLength={3000}
                rows={3}
              />
            </label>
            <button
              className={styles.button}
              disabled={busy || document.processing_status === "archived"}
            >
              {editing
                ? "Änderungen als Entwurf speichern"
                : "Manuellen Entwurf speichern"}
            </button>
            {editing && (
              <button
                className={styles.button}
                type="button"
                onClick={() => setEditing(null)}
              >
                Bearbeitung abbrechen
              </button>
            )}
          </form>
          {busy && <p role="status">Wird geladen…</p>}
          {loaded && !drafts.length && <p>Noch keine Fragenentwürfe.</p>}
          {drafts.map((draft) => (
            <article className={styles.item} key={draft.id}>
              <strong>{draft.prompt}</strong>
              <p>
                Version {draft.document_version} · {labels[draft.status]}
              </p>
              <blockquote>{draft.citation}</blockquote>
              <ol>
                {draft.choices.map((choice, i) => (
                  <li key={i}>
                    {choice}
                    {draft.correct_indices.includes(i) ? " (richtig)" : ""}
                  </li>
                ))}
              </ol>
              <p>{draft.explanation}</p>
              <button
                className={styles.button}
                type="button"
                disabled={busy || document.processing_status === "archived"}
                onClick={() => setEditing(draft)}
              >
                Entwurf bearbeiten
              </button>
              <div className={styles.formRow}>
                {(["review_pending", "approved", "rejected"] as const).map(
                  (status) => (
                    <button
                      className={styles.button}
                      key={status}
                      type="button"
                      disabled={
                        busy ||
                        draft.status === status ||
                        (status === "approved" &&
                          (document.processing_status !== "approved" ||
                            (!!document.valid_from &&
                              document.valid_from >
                                new Date().toISOString().slice(0, 10))))
                      }
                      onClick={() => void persist({ ...draft, status }, true)}
                    >
                      {status === "review_pending"
                        ? "Zur Prüfung"
                        : status === "approved"
                          ? "Fachlich freigeben"
                          : "Ablehnen"}
                    </button>
                  ),
                )}
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}

