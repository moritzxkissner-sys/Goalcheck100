"use client";
import { useState, type FormEvent } from "react";
import { academyTracks } from "@/lib/academy";
import {
  documentStatuses,
  type DocumentMetadata,
} from "@/lib/academy-documents";
import styles from "./reference-panels.module.css";
export const documentStatusLabels: Record<string, string> = {
  uploaded: "Hochgeladen",
  review_pending: "In Prüfung",
  approved: "Freigegeben",
  archived: "Archiviert",
};
export default function AcademyDocumentFields({
  value,
  moduleId,
}: {
  value?: DocumentMetadata;
  moduleId?: string;
}) {
  return (
    <>
      <div className={styles.formRow}>
        {(
          [
            ["insurance_line", "Sparte"],
            ["product", "Produkt"],
            ["insurer", "Versicherer"],
            ["document_version", "Dokumentversion"],
          ] as const
        ).map(([name, label]) => (
          <label key={name}>
            {label}
            <input
              className={styles.input}
              name={name}
              defaultValue={value?.[name]}
              required
              maxLength={name === "document_version" ? 80 : 120}
            />
          </label>
        ))}
      </div>
      <div className={styles.formRow}>
        <label>
          Gültig ab (optional)
          <input
            className={styles.input}
            name="valid_from"
            type="date"
            defaultValue={value?.valid_from ?? ""}
          />
        </label>
        <label>
          Modul (optional)
          <select
            className={styles.input}
            name="module_id"
            defaultValue={value?.module_id ?? moduleId ?? ""}
          >
            <option value="">Noch nicht zugeordnet</option>
            {academyTracks.map((track) => (
              <optgroup key={track.id} label={track.title}>
                {track.modules.map((module) => (
                  <option key={module.id} value={module.id}>
                    {module.title}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label>
          Status
          <select
            className={styles.input}
            name="processing_status"
            defaultValue={value?.processing_status ?? "uploaded"}
          >
            {documentStatuses.map((status) => (
              <option key={status} value={status}>
                {documentStatusLabels[status]}
              </option>
            ))}
          </select>
        </label>
      </div>
    </>
  );
}
export function AcademyDocumentEditor({
  document,
  onSaved,
}: {
  document: DocumentMetadata & { id: string };
  onSaved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/training-documents/${document.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          Object.fromEntries(new FormData(event.currentTarget)),
        ),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      await onSaved();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Speichern fehlgeschlagen.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <details>
      <summary>Quellenangaben bearbeiten</summary>
      <form className={styles.form} onSubmit={save}>
        <AcademyDocumentFields value={document} />
        <p className={styles.hint}>
          Bei vorhandenen Fragenentwürfen bleibt die Version gesperrt. Neue
          PDF-Versionen bitte als neues Dokument hochladen. Änderungen erfordern
          eine erneute Fragenprüfung.
        </p>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <button className={styles.button} disabled={busy}>
          Quellenangaben speichern
        </button>
      </form>
    </details>
  );
}
