"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  Home,
  Palmtree,
  Plus,
  Stethoscope,
  Tag,
  Trash2,
} from "lucide-react";
import {
  calendarReasons,
  type TeamCalendarEntry,
  type TeamCalendarInput,
  type TeamCalendarMember,
} from "@/lib/team-calendar";
import styles from "./team-calendar.module.css";

export type TeamCalendarProps = {
  members: TeamCalendarMember[];
  entries: TeamCalendarEntry[];
  currentUserId: string;
  canManageCalendar: boolean;
  onCreate: (input: TeamCalendarInput) => Promise<{ error?: string }>;
  onDelete: (id: string) => Promise<{ error?: string }>;
  onLoadMonth: (month: string) => Promise<TeamCalendarEntry[]>;
  openFormSignal?: number;
};

const labels = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const icons = {
  Urlaub: Palmtree,
  Krankheit: Stethoscope,
  Homeoffice: Home,
  Weiterbildung: GraduationCap,
  Sonstiges: Tag,
};
const reasonClasses = {
  Urlaub: styles.vacation,
  Krankheit: styles.sick,
  Homeoffice: styles.home,
  Weiterbildung: styles.learning,
  Sonstiges: styles.other,
};

function localToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function shiftMonth(month: string, distance: number) {
  const [year, index] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, index - 1 + distance, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthName(month: string) {
  const [year, index] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("de-DE", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, index - 1, 1)));
}

function overlap(entry: TeamCalendarEntry, month: string, days: number) {
  const first = `${month}-01`;
  const last = `${month}-${String(days).padStart(2, "0")}`;
  if (entry.ends_on < first || entry.starts_on > last) return null;
  const start = Math.max(
    1,
    Number(entry.starts_on < first ? "1" : entry.starts_on.slice(8)),
  );
  const end = Math.min(
    days,
    Number(entry.ends_on > last ? String(days) : entry.ends_on.slice(8)),
  );
  return { start, length: end - start + 1 };
}

function avatar(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export default function TeamCalendar({
  members,
  entries,
  currentUserId,
  canManageCalendar,
  onCreate,
  onDelete,
  onLoadMonth,
  openFormSignal = 0,
}: TeamCalendarProps) {
  const today = localToday();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [visibleEntries, setVisibleEntries] = useState(entries);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [startsOn, setStartsOn] = useState(today);
  const [endsOn, setEndsOn] = useState(today);
  const [reason, setReason] =
    useState<(typeof calendarReasons)[number]>("Urlaub");
  const [comment, setComment] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState(currentUserId);
  const formRef = useRef<HTMLFormElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const initialSignal = useRef(openFormSignal);
  const requestId = useRef(0);

  useEffect(() => {
    if (openFormSignal === initialSignal.current) return;
    initialSignal.current = openFormSignal;
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    dateRef.current?.focus({ preventScroll: true });
  }, [openFormSignal]);

  async function loadMonth(nextMonth: string) {
    const id = ++requestId.current;
    setMonth(nextMonth);
    setLoading(true);
    setError("");
    setConfirmDeleteId(null);
    try {
      const loaded = await onLoadMonth(nextMonth);
      if (id === requestId.current) setVisibleEntries(loaded);
    } catch {
      if (id === requestId.current)
        setError("Der Kalender konnte nicht geladen werden.");
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }

  async function deleteEntry(id: string) {
    setDeletingId(id);
    setError("");
    setSuccess("");
    try {
      const result = await onDelete(id);
      if (result.error) {
        setError(result.error);
        return;
      }
      setVisibleEntries((current) =>
        current.filter((entry) => entry.id !== id),
      );
      setConfirmDeleteId(null);
      setSuccess("Kalendereintrag gelöscht.");
    } catch {
      setError(
        "Der Termin konnte nicht gelöscht werden. Bitte versuche es erneut.",
      );
    } finally {
      setDeletingId(null);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    const selectedMember = members.find(
      (member) => member.id === selectedMemberId,
    );
    if (!selectedMember || selectedMember.can_receive_entries === false) {
      setError(
        "Dieser Mitarbeiter kann derzeit keine Kalendereinträge erhalten.",
      );
      return;
    }
    if (selectedMemberId !== currentUserId && !canManageCalendar) {
      setError("Du kannst nur deine eigenen Abwesenheiten eintragen.");
      return;
    }
    if (endsOn < startsOn) {
      setError("Das Enddatum muss am oder nach dem Startdatum liegen.");
      return;
    }
    setSaving(true);
    let created = false;
    try {
      const result = await onCreate({
        user_id: selectedMemberId,
        starts_on: startsOn,
        ends_on: endsOn,
        reason,
        comment: comment.trim(),
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      created = true;
      // Show the saved date immediately, including entries in another month.
      const entryMonth = startsOn.slice(0, 7);
      const refreshed = await onLoadMonth(entryMonth);
      ++requestId.current;
      setMonth(entryMonth);
      setVisibleEntries(refreshed);
      setComment("");
      setSuccess("Abwesenheit eingetragen.");
    } catch {
      setError(
        created
          ? "Der Eintrag wurde gespeichert, aber der Kalender konnte nicht aktualisiert werden."
          : "Der Eintrag konnte nicht gespeichert werden. Bitte versuche es erneut.",
      );
    } finally {
      setSaving(false);
    }
  }

  const [year, monthIndex] = month.split("-").map(Number);
  const days = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
  const allDays = Array.from({ length: days }, (_, index) => {
    const day = index + 1;
    const weekday = new Date(Date.UTC(year, monthIndex - 1, day)).getUTCDay();
    return { day, weekday, date: `${month}-${String(day).padStart(2, "0")}` };
  });
  const myMember = members.find((member) => member.id === currentUserId);
  const myEntries = visibleEntries
    .filter((entry) => entry.user_id === currentUserId)
    .sort((a, b) => a.starts_on.localeCompare(b.starts_on));
  const formatDate = (date: string) =>
    `${date.slice(8, 10)}.${date.slice(5, 7)}.${date.slice(0, 4)}`;

  return (
    <section
      className={styles.card}
      aria-label="Teamkalender"
      data-testid="team-calendar"
    >
      <header className={styles.header}>
        <div className={styles.heading}>
          <span className={styles.calendarIcon}>
            <CalendarDays size={22} aria-hidden="true" />
          </span>
          <div>
            <h2>Teamkalender</h2>
            <p>
              Urlaub, Krankheit, Homeoffice, Weiterbildung und sonstige Termine
            </p>
          </div>
        </div>
        <div className={styles.controls} aria-label="Monat wählen">
          <button
            type="button"
            aria-label="Vorheriger Monat"
            onClick={() => void loadMonth(shiftMonth(month, -1))}
            disabled={loading || saving}
          >
            <ChevronLeft size={17} />
          </button>
          <strong aria-live="polite">{monthName(month)}</strong>
          <button
            type="button"
            aria-label="Nächster Monat"
            onClick={() => void loadMonth(shiftMonth(month, 1))}
            disabled={loading || saving}
          >
            <ChevronRight size={17} />
          </button>
          <button
            type="button"
            onClick={() => void loadMonth(localToday().slice(0, 7))}
            disabled={loading || saving}
          >
            Heute
          </button>
        </div>
      </header>

      <div className={styles.legend} aria-label="Farblegende">
        {calendarReasons.map((item) => (
          <span key={item}>
            <i className={reasonClasses[item]} />
            {item}
          </span>
        ))}
      </div>

      <div className={styles.scroller} aria-busy={loading}>
        <div
          className={styles.grid}
          style={{
            gridTemplateColumns: `180px repeat(${days}, minmax(38px, 1fr))`,
          }}
        >
          <div className={`${styles.memberHeading} ${styles.sticky}`}>
            Mitarbeiter
          </div>
          {allDays.map(({ day, weekday, date }) => (
            <div
              key={date}
              className={`${styles.dateHeading} ${weekday === 0 || weekday === 6 ? styles.weekend : ""} ${date === today ? styles.today : ""}`}
            >
              <small>{labels[weekday]}</small>
              <strong>{day}</strong>
            </div>
          ))}
          {members.map((member, memberIndex) => {
            const memberEntries = visibleEntries
              .filter((entry) => entry.user_id === member.id)
              .map((entry) => ({ entry, segment: overlap(entry, month, days) }))
              .filter(
                (
                  item,
                ): item is {
                  entry: TeamCalendarEntry;
                  segment: { start: number; length: number };
                } => item.segment !== null,
              )
              .sort((a, b) => a.segment.start - b.segment.start);
            const laneEnds: number[] = [];
            const laidOut = memberEntries.map((item) => {
              let lane = laneEnds.findIndex((end) => end < item.segment.start);
              if (lane < 0) lane = laneEnds.length;
              laneEnds[lane] = item.segment.start + item.segment.length - 1;
              return { ...item, lane };
            });
            const row = memberIndex + 2;
            return (
              <div
                key={member.id}
                className={styles.memberRow}
                style={{
                  gridColumn: `1 / span ${days + 1}`,
                  gridRow: row,
                  gridTemplateColumns: `180px repeat(${days}, minmax(38px, 1fr))`,
                  gridTemplateRows: `repeat(${Math.max(1, laneEnds.length)}, 38px)`,
                }}
              >
                <div
                  className={`${styles.memberName} ${styles.sticky}`}
                  style={{
                    gridRow: `1 / span ${Math.max(1, laneEnds.length)}`,
                  }}
                >
                  <span className={styles.avatar}>
                    {avatar(member.full_name)}
                  </span>
                  {canManageCalendar && member.can_receive_entries !== false ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedMemberId(member.id);
                        formRef.current?.scrollIntoView({
                          behavior: "smooth",
                          block: "center",
                        });
                      }}
                      aria-label={`${member.full_name} für Kalendereintrag auswählen`}
                    >
                      {member.full_name}
                    </button>
                  ) : (
                    <span>{member.full_name}</span>
                  )}
                  {member.id === currentUserId && <small>Du</small>}
                </div>
                {allDays.map(({ date, day, weekday }) => (
                  <div
                    key={date}
                    className={`${styles.dayCell} ${weekday === 0 || weekday === 6 ? styles.weekend : ""} ${date === today ? styles.today : ""}`}
                    style={{
                      gridColumn: day + 1,
                      gridRow: `1 / span ${Math.max(1, laneEnds.length)}`,
                    }}
                  />
                ))}
                {laidOut.map(({ entry, segment, lane }) => {
                  const Icon = icons[entry.reason];
                  return (
                    <div
                      key={entry.id}
                      className={`${styles.event} ${reasonClasses[entry.reason]}`}
                      title={`${member.full_name}: ${entry.reason}, ${entry.starts_on}–${entry.ends_on}${entry.comment ? ` · ${entry.comment}` : ""}`}
                      style={{
                        gridColumn: `${segment.start + 1} / span ${segment.length}`,
                        gridRow: lane + 1,
                      }}
                    >
                      <Icon size={14} aria-hidden="true" />
                      <span>{entry.reason}</span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      {members.length === 0 && (
        <p className={styles.empty}>Noch keine Teammitglieder vorhanden.</p>
      )}
      {visibleEntries.length === 0 && members.length > 0 && !loading && (
        <p className={styles.empty}>Keine Termine in diesem Monat.</p>
      )}

      <div className={styles.ownEntries} aria-label="Meine Kalendereinträge">
        <h3>Meine Termine in diesem Monat</h3>
        {myEntries.length === 0 ? (
          <p>Du hast in diesem Monat keine Termine eingetragen.</p>
        ) : (
          <ul>
            {myEntries.map((entry) => (
              <li key={entry.id}>
                <span
                  className={`${styles.entryDot} ${reasonClasses[entry.reason]}`}
                />
                <span className={styles.entryDetails}>
                  <strong>{entry.reason}</strong>
                  <small>
                    {formatDate(entry.starts_on)}
                    {entry.ends_on !== entry.starts_on
                      ? ` – ${formatDate(entry.ends_on)}`
                      : ""}
                  </small>
                </span>
                {confirmDeleteId === entry.id ? (
                  <span className={styles.deleteConfirm}>
                    <span>Wirklich löschen?</span>
                    <button
                      type="button"
                      className={styles.confirmButton}
                      onClick={() => void deleteEntry(entry.id)}
                      disabled={deletingId !== null || saving}
                    >
                      {deletingId === entry.id ? "Lösche…" : "Ja, löschen"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      disabled={deletingId !== null}
                    >
                      Abbrechen
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className={styles.deleteButton}
                    aria-label={`${entry.reason} vom ${formatDate(entry.starts_on)} löschen`}
                    onClick={() => setConfirmDeleteId(entry.id)}
                    disabled={deletingId !== null || saving}
                  >
                    <Trash2 size={15} aria-hidden="true" /> Löschen
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <form
        id="team-calendar-form"
        ref={formRef}
        className={styles.form}
        onSubmit={(event) => void submit(event)}
      >
        <h3>
          <CalendarDays size={18} aria-hidden="true" /> Abwesenheit eintragen
        </h3>
        <div className={styles.formGrid}>
          <label>
            Mitarbeiter
            <select
              value={selectedMemberId}
              onChange={(event) => setSelectedMemberId(event.target.value)}
              required
            >
              {members.map((member) => (
                <option
                  key={member.id}
                  value={member.id}
                  disabled={
                    member.can_receive_entries === false ||
                    (member.id !== currentUserId && !canManageCalendar)
                  }
                >
                  {member.full_name}
                  {member.id === currentUserId ? " (Du)" : ""}
                </option>
              ))}
              {!myMember && (
                <option value={currentUserId}>Nicht verfügbar</option>
              )}
            </select>
          </label>
          <label>
            Datum von
            <input
              ref={dateRef}
              type="date"
              value={startsOn}
              onChange={(event) => {
                setStartsOn(event.target.value);
                if (endsOn < event.target.value) setEndsOn(event.target.value);
              }}
              required
            />
          </label>
          <label>
            Datum bis
            <input
              type="date"
              value={endsOn}
              min={startsOn}
              onChange={(event) => setEndsOn(event.target.value)}
              required
            />
          </label>
          <label>
            Abwesenheitsgrund
            <select
              value={reason}
              onChange={(event) =>
                setReason(
                  event.target.value as (typeof calendarReasons)[number],
                )
              }
            >
              {calendarReasons.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label>
            Kommentar <span>(optional)</span>
            <input
              type="text"
              value={comment}
              maxLength={300}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Zusätzliche Information"
            />
          </label>
          <button type="submit" disabled={saving || !myMember}>
            <Plus size={17} aria-hidden="true" />
            {saving ? "Speichern…" : "Eintragen"}
          </button>
        </div>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        {!myMember && (
          <p className={styles.error}>
            Dein Konto ist derzeit nicht in der Kalenderliste.
          </p>
        )}
        {success && (
          <p className={styles.success} role="status">
            {success}
          </p>
        )}
      </form>
    </section>
  );
}
