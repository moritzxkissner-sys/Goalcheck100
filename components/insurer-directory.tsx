"use client";

import { useEffect, useMemo, useState } from "react";
import {
  filterInsurerContacts,
  INSURER_CONTACTS,
  INSURER_CONTACTS_VERIFIED_ON,
  type InsurerContactFilter,
} from "@/lib/insurer-directory";
import styles from "./reference-panels.module.css";

const STORAGE_KEY = "goaltrack:insurer-directory:v1";

export default function InsurerDirectory() {
  const [query, setQuery] = useState("");
  const [contactFilter, setContactFilter] =
    useState<InsurerContactFilter>("all");
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = sessionStorage.getItem(STORAGE_KEY);
        if (saved) {
          const selection = JSON.parse(saved) as {
            query?: unknown;
            contactFilter?: unknown;
          };
          if (typeof selection.query === "string") setQuery(selection.query);
          if (
            selection.contactFilter === "all" ||
            selection.contactFilter === "email" ||
            selection.contactFilter === "phone"
          ) {
            setContactFilter(selection.contactFilter);
          }
        }
      } catch {
        // The directory still works when browser storage is unavailable.
      }
      setRestored(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!restored) return;
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ query, contactFilter }),
      );
    } catch {
      // Search and filtering do not depend on browser storage.
    }
  }, [query, contactFilter, restored]);

  const filtered = useMemo(
    () => filterInsurerContacts(INSURER_CONTACTS, query, contactFilter),
    [query, contactFilter],
  );
  const verifiedOn = useMemo(
    () =>
      new Date(`${INSURER_CONTACTS_VERIFIED_ON}T12:00:00Z`).toLocaleDateString(
        "de-DE",
      ),
    [],
  );
  return (
    <section className={styles.panel} aria-labelledby="insurer-heading">
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>Kündigungen · Vorversicherungen</p>
          <h2 id="insurer-heading">Versicherer finden</h2>
          <p>
            {INSURER_CONTACTS.length} Gesellschaften mit Postanschrift und
            verfügbaren Kontaktdaten. Quellen geprüft am {verifiedOn}.
          </p>
        </div>
      </div>
      <div className={styles.directoryControls}>
        <div>
          <label className={styles.searchLabel} htmlFor="insurer-search">
            Versicherer, Ort oder Kontakt suchen
          </label>
          <input
            id="insurer-search"
            className={styles.input}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="z. B. AXA oder Köln"
          />
        </div>
        <div>
          <label
            className={styles.searchLabel}
            htmlFor="insurer-contact-filter"
          >
            Kontaktweg
          </label>
          <select
            id="insurer-contact-filter"
            className={styles.input}
            value={contactFilter}
            onChange={(event) =>
              setContactFilter(event.target.value as InsurerContactFilter)
            }
          >
            <option value="all">Alle</option>
            <option value="email">Mit E-Mail</option>
            <option value="phone">Mit Telefon</option>
          </select>
        </div>
      </div>
      <p className={styles.hint}>
        Prüfe vor dem Versand die Gesellschaft auf dem Versicherungsschein und
        die aktuelle Kontaktseite.
      </p>
      <p className={styles.resultCount} role="status" aria-live="polite">
        {filtered.length} von {INSURER_CONTACTS.length} Gesellschaften
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
            {(contact.phone || contact.email) && (
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
            )}
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
