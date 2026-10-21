"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  TRAINING_MAX_BYTES,
  validateTrainingFile,
  type TrainingDocument,
} from "@/lib/training-documents";
import styles from "./reference-panels.module.css";

const cache = new Map<string, { documents: TrainingDocument[]; at: number }>();
const CACHE_MS = 60_000;

export default function TrainingDocuments({
  userId,
  demo = false,
}: {
  userId: string;
  demo?: boolean;
}) {
  const initial = cache.get(userId);
  const [documents, setDocuments] = useState<TrainingDocument[]>(
    initial?.documents ?? [],
  );
  const [loading, setLoading] = useState(!demo && !initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");

  const load = useCallback(
    async (force = false) => {
      if (demo) return;
      const cached = cache.get(userId);
      if (!force && cached && Date.now() - cached.at < CACHE_MS) {
        setDocuments(cached.documents);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const response = await fetch("/api/training-documents", {
          cache: "no-store",
        });
        const body = await response.json();
        if (!response.ok)
          throw new Error(
            body.error ?? "Dokumente konnten nicht geladen werden.",
          );
        setDocuments(body.documents);
        cache.set(userId, { documents: body.documents, at: Date.now() });
        setError("");
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Dokumente konnten nicht geladen werden.",
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

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (demo) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const file = form.get("file");
    if (!(file instanceof File)) {
      setError("Bitte eine PDF-Datei auswählen.");
      return;
    }
    const fileError = validateTrainingFile(file);
    if (fileError) {
      setError(fileError);
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/training-documents", {
        method: "POST",
        body: form,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Upload fehlgeschlagen.");
      formElement.reset();
      cache.delete(userId);
      await load(true);
      setNotice("Dokument wurde hochgeladen.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Upload fehlgeschlagen.",
      );
    } finally {
      setBusy(false);
    }
  }

  const filtered = documents.filter((document) =>
    `${document.title} ${document.description}`
      .toLocaleLowerCase("de-DE")
      .includes(query.trim().toLocaleLowerCase("de-DE")),
  );
  return (
    <section className={styles.panel} aria-labelledby="training-heading">
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>Weiterbildung</p>
          <h2 id="training-heading">Dokumente</h2>
          <p>PDF-Unterlagen für aktive Teammitglieder.</p>
        </div>
      </div>
      {demo ? (
        <p className={styles.empty}>
          Im Demo-Modus sind keine Dokumente hinterlegt. Melde dich an, um
          Teamunterlagen zu öffnen oder hochzuladen.
        </p>
      ) : (
        <>
          <form onSubmit={upload} className={styles.form}>
            <div className={styles.formRow}>
              <label>
                Titel
                <input
                  className={styles.input}
                  name="title"
                  required
                  maxLength={120}
                  placeholder="z. B. Produktschulung"
                />
              </label>
              <label>
                PDF-Datei
                <input
                  className={styles.input}
                  name="file"
                  type="file"
                  accept=".pdf,application/pdf"
                  required
                />
              </label>
            </div>
            <label>
              Beschreibung (optional)
              <textarea
                className={styles.input}
                name="description"
                maxLength={500}
                rows={2}
                placeholder="Kurzer Hinweis zum Inhalt"
              />
            </label>
            <div className={styles.formFoot}>
              <span>Maximal {TRAINING_MAX_BYTES / 1024 / 1024} MB pro PDF</span>
              <button className={styles.button} type="submit" disabled={busy}>
                {busy ? "Wird hochgeladen…" : "Dokument hochladen"}
              </button>
            </div>
          </form>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className={styles.notice} role="status">
              {notice}
            </p>
          )}
          <div className={styles.listHeader}>
            <label htmlFor="training-search">Teamunterlagen</label>
            <button
              type="button"
              onClick={() => void load(true)}
              disabled={loading}
            >
              Aktualisieren
            </button>
          </div>
          <input
            id="training-search"
            className={styles.input}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Titel oder Beschreibung suchen"
          />
          {loading ? (
            <p className={styles.empty}>Dokumente werden geladen…</p>
          ) : filtered.length ? (
            <ul className={styles.docList}>
              {filtered.map((document) => (
                <li key={document.id}>
                  <div>
                    <strong>{document.title}</strong>
                    {document.description && <p>{document.description}</p>}
                    <small>
                      {new Date(document.created_at).toLocaleDateString(
                        "de-DE",
                      )}{" "}
                      · {(document.file_size / 1024 / 1024).toFixed(1)} MB
                    </small>
                  </div>
                  <a
                    className={styles.button}
                    href={`/api/training-documents/${document.id}/download`}
                  >
                    PDF herunterladen
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.empty}>
              {query
                ? "Keine passenden Dokumente gefunden."
                : "Noch keine Dokumente vorhanden."}
            </p>
          )}
        </>
      )}
    </section>
  );
}
