"use client";

import { useMemo, useState } from "react";
import {
  INSURER_CONTACTS,
  INSURER_CONTACTS_VERIFIED_ON,
} from "@/lib/insurer-directory";
import styles from "./reference-panels.module.css";

export default function InsurerDirectory() {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("de-DE");
    return INSURER_CONTACTS.filter((contact) =>
      [contact.name, ...contact.address]
        .join(" ")
        .toLocaleLowerCase("de-DE")
        .includes(term),
    );
  }, [query]);
  return (
    <section className={styles.panel} aria-labelledby="insurer-heading">
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>Kündigungen · Vorversicherungen</p>
          <h2 id="insurer-heading">Versicherer finden</h2>
          <p>
            Postanschriften und Kontakte der genannten Gesellschaften. Stand:{" "}
            {new Date(
              `${INSURER_CONTACTS_VERIFIED_ON}T12:00:00Z`,
            ).toLocaleDateString("de-DE")}
            .
          </p>
        </div>
      </div>
      <label className={styles.searchLabel} htmlFor="insurer-search">
        Versicherer oder Ort suchen
      </label>
      <input
        id="insurer-search"
        className={styles.input}
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="z. B. AXA oder Köln"
      />
      <p className={styles.hint}>
        Prüfe vor dem Versand die Gesellschaft auf dem Versicherungsschein und
        die aktuelle Kontaktseite.
      </p>
      <div className={styles.grid}>
        {filtered.map((contact) => (
          <article className={styles.item} key={contact.id}>
            <h3>{contact.name}</h3>
            <address>
              {contact.address.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </address>
            <div className={styles.contacts}>
              {contact.phone && (
                <a href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`}>
                  {contact.phone}
                </a>
              )}
              {contact.email && (
                <a href={`mailto:${contact.email}`}>{contact.email}</a>
              )}
            </div>
            <a
              className={styles.source}
              href={contact.source}
              target="_blank"
              rel="noopener noreferrer"
            >
              Quelle beim Versicherer ↗
            </a>
          </article>
        ))}
        {filtered.length === 0 && (
          <p className={styles.empty}>
            Kein Eintrag gefunden. Prüfe den Namen der Gesellschaft auf dem
            Versicherungsschein.
          </p>
        )}
      </div>
    </section>
  );
}
