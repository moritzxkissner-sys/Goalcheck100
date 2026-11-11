"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Clock3,
  Search,
  Funnel,
  X,
} from "lucide-react";
import type { FollowUpTask } from "@/lib/follow-ups";
import styles from "./follow-up-search.module.css";

type AppointmentType = "all" | "follow_up" | "phone";
type SearchResult = { tasks: FollowUpTask[]; hasMore: boolean };
type CacheEntry = { data: SearchResult; expiresAt: number };
const CACHE_TTL_MS = 60_000;
type ResultState = SearchResult & {
  key: string;
  error: string;
  loading: boolean;
};
const dateLabel = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Europe/Berlin",
});
const clockLabel = new Intl.DateTimeFormat("de-DE", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Berlin",
});

export default function FollowUpSearch({
  onSelect,
  revision,
  demo = false,
}: {
  onSelect: (task: FollowUpTask) => void;
  revision: number;
  demo?: boolean;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [type, setType] = useState<AppointmentType>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<ResultState | null>(null);
  const cache = useRef<{
    revision: number;
    entries: Map<string, CacheEntry>;
  }>({ revision, entries: new Map() });
  const lastAutoRefresh = useRef(0);
  const q = query.trim();
  const activeFilters =
    Number(type !== "all") + Number(Boolean(from)) + Number(Boolean(to));
  const active = Boolean(q || activeFilters);
  const validation =
    q.length === 1
      ? "Bitte mindestens 2 Zeichen eingeben."
      : from && to && from > to
        ? "Das Enddatum muss am oder nach dem Startdatum liegen."
        : "";
  const key = JSON.stringify([q, type, from, to, page, revision, demo]);
  const current = result?.key === key ? result : null;
  const loading =
    active && !validation && !demo && (!current || current.loading);

  useEffect(() => {
    if (cache.current.revision !== revision) {
      cache.current = { revision, entries: new Map() };
    }
    if (!active || validation || demo) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      const cached = cache.current.entries.get(key);
      if (cached && cached.expiresAt > Date.now()) {
        setResult({ ...cached.data, key, loading: false, error: "" });
        return;
      }
      cache.current.entries.delete(key);
      setResult({ key, tasks: [], hasMore: false, loading: true, error: "" });
      try {
        const params = new URLSearchParams({
          q,
          type,
          from,
          to,
          page: String(page),
        });
        const response = await fetch(`/api/follow-ups/search?${params}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const body = await response.json();
        if (!response.ok)
          throw new Error(
            typeof body.error === "string"
              ? body.error
              : "Die Suche konnte nicht geladen werden.",
          );
        if (!Array.isArray(body.tasks) || typeof body.hasMore !== "boolean")
          throw new Error("Die Suche hat eine ungültige Antwort geliefert.");
        if (controller.signal.aborted) return;
        const data: SearchResult = { tasks: body.tasks, hasMore: body.hasMore };
        if (cache.current.entries.size >= 30)
          cache.current.entries.delete(
            cache.current.entries.keys().next().value!,
          );
        cache.current.entries.set(key, {
          data,
          expiresAt: Date.now() + CACHE_TTL_MS,
        });
        setResult({ ...data, key, loading: false, error: "" });
      } catch (error) {
        if (controller.signal.aborted) return;
        setResult({
          key,
          tasks: [],
          hasMore: false,
          loading: false,
          error:
            error instanceof Error
              ? error.message
              : "Die Suche konnte nicht geladen werden.",
        });
      }
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    active,
    validation,
    demo,
    q,
    type,
    from,
    to,
    page,
    revision,
    key,
    attempt,
  ]);

  useEffect(() => {
    let timer: number | undefined;
    function scheduleRefresh() {
      cache.current.entries.clear();
      window.clearTimeout(timer);
      if (
        document.visibilityState !== "visible" ||
        !active ||
        validation ||
        demo
      )
        return;
      // Returning to a tab commonly emits both visibilitychange and focus.
      // Merge those events and suppress repeated focus bursts.
      timer = window.setTimeout(() => {
        if (document.visibilityState !== "visible") return;
        if (Date.now() - lastAutoRefresh.current < 1_000) return;
        lastAutoRefresh.current = Date.now();
        setAttempt((value) => value + 1);
      }, 150);
    }
    window.addEventListener("focus", scheduleRefresh);
    document.addEventListener("visibilitychange", scheduleRefresh);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", scheduleRefresh);
      document.removeEventListener("visibilitychange", scheduleRefresh);
    };
  }, [active, validation, demo]);

  function refresh() {
    cache.current.entries.clear();
    setAttempt((value) => value + 1);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    refresh();
  }
  function reset() {
    setQuery("");
    setType("all");
    setFrom("");
    setTo("");
    setPage(0);
  }

  return (
    <section className={styles.panel} aria-label="Kalender durchsuchen">
      <form onSubmit={submit} className={styles.form}>
        <div className={styles.searchRow}>
          <div className={styles.searchField}>
            <Search size={18} aria-hidden="true" />
            <label className={styles.srOnly} htmlFor={`${id}-query`}>
              Alle Termine durchsuchen
            </label>
            <input
              id={`${id}-query`}
              type="search"
              maxLength={120}
              value={query}
              placeholder="Termine suchen ..."
              aria-describedby={`${id}-hint`}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(0);
              }}
            />
          </div>
          <button
            className={styles.searchButton}
            type="submit"
            disabled={Boolean(validation) || !active}
          >
            Suchen
          </button>
          <button
            className={`${styles.filterButton} ${filtersOpen || activeFilters ? styles.filterActive : ""}`}
            type="button"
            aria-expanded={filtersOpen}
            aria-controls={`${id}-filters`}
            onClick={() => setFiltersOpen((value) => !value)}
          >
            <Funnel size={18} aria-hidden="true" />
            <span>Filter{activeFilters ? ` (${activeFilters})` : ""}</span>
          </button>
          {active && (
            <button className={styles.reset} type="button" onClick={reset}>
              <X size={16} aria-hidden="true" />
              Zurücksetzen
            </button>
          )}
        </div>
        {filtersOpen && (
          <div className={styles.filters} id={`${id}-filters`}>
            <label>
              Terminart
              <select
                aria-label="Terminart"
                value={type}
                onChange={(event) => {
                  setType(event.target.value as AppointmentType);
                  setPage(0);
                }}
              >
                <option value="all">Alle Terminarten</option>
                <option value="follow_up">Follow-up</option>
                <option value="phone">Telefontermin</option>
              </select>
            </label>
            <label>
              Von
              <input
                type="date"
                aria-label="Von"
                value={from}
                max={to || undefined}
                onChange={(event) => {
                  setFrom(event.target.value);
                  setPage(0);
                }}
              />
            </label>
            <label>
              Bis
              <input
                type="date"
                aria-label="Bis"
                value={to}
                min={from || undefined}
                onChange={(event) => {
                  setTo(event.target.value);
                  setPage(0);
                }}
              />
            </label>
          </div>
        )}
        <p
          className={validation ? styles.validation : styles.hint}
          id={`${id}-hint`}
        >
          {validation ||
            "Sucht in allen Terminen – unabhängig von der angezeigten Kalenderwoche."}
        </p>
      </form>
      {active && !validation && (
        <div className={styles.results} aria-busy={loading}>
          <div role="status" aria-live="polite" className={styles.status}>
            {demo
              ? "Die Terminsuche ist nach der Anmeldung verfügbar."
              : loading
                ? "Termine werden gesucht …"
                : current?.error
                  ? ""
                  : current?.tasks.length
                    ? `${current.tasks.length} Treffer · Seite ${page + 1}`
                    : "Keine passenden Termine gefunden. Suchbegriff oder Filter anpassen."}
          </div>
          {current?.error && (
            <div className={styles.error} role="alert">
              {current.error}
              <button type="button" onClick={refresh}>
                Erneut versuchen
              </button>
            </div>
          )}
          {!loading &&
            !demo &&
            !current?.error &&
            Boolean(current?.tasks.length) && (
              <ul className={styles.list}>
                {current!.tasks.map((task) => {
                  const appointmentType = task.appointment_type;
                  return (
                    <li key={task.id}>
                      <button
                        className={styles.result}
                        type="button"
                        onClick={() => onSelect(task)}
                      >
                        <span className={styles.details}>
                          <strong>{task.customer_name || task.title}</strong>
                          <span>
                            {task.customer_name ? task.title : "Termin"}
                            {task.offer_subject
                              ? ` · ${task.offer_subject}`
                              : ""}
                          </span>
                        </span>
                        <span className={styles.meta}>
                          <span>
                            {dateLabel.format(new Date(task.start_time))}
                          </span>
                          <span>
                            <Clock3 size={13} aria-hidden="true" />
                            {clockLabel.format(new Date(task.start_time))} Uhr
                          </span>
                        </span>
                        <span
                          className={`${styles.badge} ${appointmentType === "phone" ? styles.phone : appointmentType === "follow_up" ? styles.followUp : ""}`}
                        >
                          {appointmentType === "phone"
                            ? "Telefontermin"
                            : appointmentType === "follow_up"
                              ? "Follow-up"
                              : "Termin"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          {!demo && (page > 0 || current?.hasMore) && (
            <nav
              className={styles.pagination}
              aria-label="Seiten der Suchergebnisse"
            >
              <button
                type="button"
                disabled={page === 0 || loading}
                onClick={() => setPage((value) => Math.max(0, value - 1))}
              >
                <ChevronLeft size={16} aria-hidden="true" />
                Zurück
              </button>
              <span>Seite {page + 1}</span>
              <button
                type="button"
                disabled={
                  !current?.hasMore || loading || Boolean(current?.error)
                }
                onClick={() => setPage((value) => value + 1)}
              >
                Weiter
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            </nav>
          )}
        </div>
      )}
    </section>
  );
}
