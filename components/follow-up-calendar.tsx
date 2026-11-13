"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Phone,
  Plus,
  X,
} from "lucide-react";
import {
  berlinLocalToIso,
  isoToBerlinLocal,
  type FollowUpStatus,
  type FollowUpTask,
  type FollowUpOutcome,
} from "@/lib/follow-ups";
import styles from "./follow-up-calendar.module.css";
import FollowUpSearch from "./follow-up-search";
import FollowUpOutcomeCard from "./follow-up-outcome-card";
import {
  CALENDAR_END_HOUR,
  CALENDAR_START_HOUR,
  calendarHours,
  isInCalendarGrid,
} from "@/lib/calendar-hours";
import { CALENDAR_HOUR_HEIGHT, layoutCalendarDay } from "@/lib/calendar-layout";

type View = "week" | "month" | "list";
type AppointmentType = "follow_up" | "phone";
type Assignment = {
  currentUserId: string;
  canAssign: boolean;
  members: { id: string; full_name: string }[];
};
type Form = {
  appointment_type: AppointmentType | "";
  assigned_to: string;
  title: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  offer_subject: string;
  start_time: string;
  end_time: string;
  status: FollowUpStatus;
  notes: string;
};
const dayFormat = new Intl.DateTimeFormat("sv-SE", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "Europe/Berlin",
});
const dayTitle = new Intl.DateTimeFormat("de-DE", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  timeZone: "UTC",
});
const monthTitle = new Intl.DateTimeFormat("de-DE", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const timeTitle = new Intl.DateTimeFormat("de-DE", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Berlin",
});
const statusName: Record<FollowUpStatus, string> = {
  pending: "Offen",
  completed: "Erledigt",
  rescheduled: "Verschoben",
};

function shiftDay(day: string, amount: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
function weekStart(day: string) {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  return shiftDay(day, -((weekday + 6) % 7));
}
function dateTitle(day: string) {
  return dayTitle.format(new Date(`${day}T12:00:00Z`));
}
function calendarWeek(day: string) {
  const thursday = new Date(`${shiftDay(weekStart(day), 3)}T12:00:00Z`);
  const firstDay = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1, 12));
  return Math.ceil(
    ((thursday.getTime() - firstDay.getTime()) / 86400000 + 1) / 7,
  );
}
function taskDay(task: FollowUpTask) {
  return isoToBerlinLocal(task.start_time).slice(0, 10);
}
function emptyForm(day: string, assignedTo = ""): Form {
  return {
    appointment_type: "follow_up",
    assigned_to: assignedTo,
    title: "Follow-up",
    customer_name: "",
    customer_email: "",
    customer_phone: "",
    offer_subject: "",
    start_time: `${day}T09:00`,
    end_time: `${day}T09:30`,
    status: "pending",
    notes: "",
  };
}

function TypeBadge({ task }: { task: FollowUpTask }) {
  const type = task.appointment_type;
  return (
    <span className={styles.typeBadge} data-type={type ?? "unknown"}>
      {type === "phone" ? (
        <Phone size={12} aria-hidden="true" />
      ) : type === "follow_up" ? (
        <CalendarDays size={12} aria-hidden="true" />
      ) : (
        <CalendarDays size={12} aria-hidden="true" />
      )}
      {type === "phone"
        ? "Telefontermin"
        : type === "follow_up"
          ? "Follow-up"
          : "Ohne Terminart"}
    </span>
  );
}

export default function FollowUpCalendar({ demo = false }: { demo?: boolean }) {
  const [anchor, setAnchor] = useState(() => dayFormat.format(new Date()));
  const [view, setView] = useState<View>("week");
  const [typeFilter, setTypeFilter] = useState<"all" | AppointmentType>("all");
  const [revision, setRevision] = useState(0);
  const [outcomePending, setOutcomePending] = useState<string | null>(null);
  const outcomeRequest = useRef(false);
  const [tasks, setTasks] = useState<FollowUpTask[]>([]);
  const [assignment, setAssignment] = useState<Assignment>({
    currentUserId: "",
    canAssign: false,
    members: [],
  });
  const [editor, setEditor] = useState<FollowUpTask | "new" | null>(null);
  const [form, setForm] = useState<Form>(() =>
    emptyForm(dayFormat.format(new Date())),
  );
  const [loading, setLoading] = useState(!demo);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const request = useRef<{ id: number; controller?: AbortController }>({
    id: 0,
  });

  const month = anchor.slice(0, 7);
  const rangeFrom = weekStart(`${month}-01`);
  const lastOfMonth = new Date(
    Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0),
  ).getUTCDate();
  const rangeTo = shiftDay(
    weekStart(`${month}-${String(lastOfMonth).padStart(2, "0")}`),
    6,
  );
  const load = useCallback(async () => {
    if (demo) return;
    request.current.controller?.abort();
    const controller = new AbortController();
    const id = ++request.current.id;
    request.current.controller = controller;
    const current = () =>
      id === request.current.id && !controller.signal.aborted;
    setLoading(true);
    try {
      const response = await fetch(
        `/api/follow-ups?from=${rangeFrom}&to=${rangeTo}`,
        { cache: "no-store", signal: controller.signal },
      );
      const body = await response.json();
      if (!current()) return;
      if (!response.ok)
        throw new Error(body.error ?? "Termine konnten nicht geladen werden.");
      setTasks(body.tasks ?? []);
      setAssignment({
        currentUserId: body.currentUserId ?? "",
        canAssign: body.canAssign === true,
        members: body.members ?? [],
      });
      setError("");
    } catch (cause) {
      if (!current()) return;
      setError(
        cause instanceof Error
          ? cause.message
          : "Termine konnten nicht geladen werden.",
      );
    } finally {
      if (current()) setLoading(false);
    }
  }, [demo, rangeFrom, rangeTo]);
  useEffect(() => {
    const activeRequest = request.current;
    let timer = setTimeout(() => void load(), 0);
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      clearTimeout(timer);
      timer = setTimeout(() => void load(), 0);
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearTimeout(timer);
      ++activeRequest.id;
      activeRequest.controller?.abort();
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);

  const week = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) =>
        shiftDay(weekStart(anchor), index),
      ),
    [anchor],
  );
  const monthDays = useMemo(
    () =>
      Array.from(
        {
          length:
            Math.round(
              (new Date(`${rangeTo}T12:00:00Z`).getTime() -
                new Date(`${rangeFrom}T12:00:00Z`).getTime()) /
                86400000,
            ) + 1,
        },
        (_, index) => shiftDay(rangeFrom, index),
      ),
    [rangeFrom, rangeTo],
  );
  const byDay = useMemo(() => {
    const result = new Map<string, FollowUpTask[]>();
    for (const task of tasks) {
      if (typeFilter !== "all" && task.appointment_type !== typeFilter)
        continue;
      const day = taskDay(task);
      result.set(day, [...(result.get(day) ?? []), task]);
    }
    for (const entries of result.values()) {
      entries.sort((a, b) => a.start_time.localeCompare(b.start_time));
    }
    return result;
  }, [tasks, typeFilter]);
  const weekTasks = tasks.filter((task) => {
    const day = taskDay(task);
    return day >= week[0] && day <= week[6];
  });
  const shown = tasks.filter(
    (task) =>
      taskDay(task).startsWith(month) &&
      (typeFilter === "all" || task.appointment_type === typeFilter),
  );
  const weekLayouts = week.map((day) =>
    layoutCalendarDay(
      (byDay.get(day) ?? []).filter((task) =>
        isInCalendarGrid(task.start_time),
      ),
    ),
  );
  const weekColumns = weekLayouts.map(
    (events) =>
      `minmax(${Math.max(1, ...events.map((event) => event.lanes)) * 260}px, 1fr)`,
  );

  function assigneeName(id: string) {
    return (
      assignment.members.find((entry) => entry.id === id)?.full_name ||
      (id === assignment.currentUserId ? "Ich" : "Zugewiesenes Mitglied")
    );
  }
  function openNew(day = anchor) {
    setForm(emptyForm(day, assignment.currentUserId));
    setEditor("new");
    setError("");
  }
  function openEdit(task: FollowUpTask) {
    setForm({
      appointment_type: task.appointment_type ?? "",
      assigned_to: task.assigned_to,
      title: task.title,
      customer_name: task.customer_name,
      customer_email: task.customer_email ?? "",
      customer_phone: task.customer_phone ?? "",
      offer_subject: task.offer_subject,
      start_time: isoToBerlinLocal(task.start_time),
      end_time: isoToBerlinLocal(task.end_time),
      status: task.status,
      notes: task.notes,
    });
    setEditor(task);
    setError("");
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (demo || busy || !editor) return;
    const start = berlinLocalToIso(form.start_time);
    const end = berlinLocalToIso(form.end_time);
    if (
      !start ||
      !end ||
      end <= start ||
      form.start_time.slice(0, 10) !== form.end_time.slice(0, 10)
    ) {
      setError(
        "Bitte gültige Zeiten am selben Tag wählen. Das Ende muss nach dem Beginn liegen.",
      );
      return;
    }
    if (
      form.customer_phone &&
      !/^\+[1-9]\d{6,14}$/.test(form.customer_phone.trim())
    ) {
      setError(
        "Telefonnummer bitte mit Ländervorwahl eingeben, z. B. +491701234567.",
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      const isNew = editor === "new";
      const response = await fetch(
        isNew ? "/api/follow-ups" : `/api/follow-ups/${editor.id}`,
        {
          method: isNew ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...form,
            appointment_type: form.appointment_type || null,
            start_time: start,
            end_time: end,
          }),
        },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          body.error ?? "Termin konnte nicht gespeichert werden.",
        );
      setEditor(null);
      setAnchor(form.start_time.slice(0, 10));
      setNotice(isNew ? "Termin eingetragen." : "Termin aktualisiert.");
      setRevision((value) => value + 1);
      if (form.start_time.slice(0, 7) === month) await load();
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
  async function remove(task: FollowUpTask) {
    if (
      demo ||
      busy ||
      !window.confirm(`Termin für ${task.customer_name} wirklich löschen?`)
    )
      return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/follow-ups/${task.id}`, {
        method: "DELETE",
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error ?? "Löschen fehlgeschlagen.");
      setEditor(null);
      setNotice("Termin gelöscht.");
      setRevision((value) => value + 1);
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Löschen fehlgeschlagen.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function changeOutcome(
    task: FollowUpTask,
    outcome: FollowUpOutcome | null,
  ) {
    if (demo || loading || busy || outcomeRequest.current) return;
    outcomeRequest.current = true;
    setOutcomePending(task.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/follow-ups/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcome_status: outcome }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          body.error ?? "Ergebnis konnte nicht gespeichert werden.",
        );
      setTasks((current) =>
        current.map((item) => (item.id === task.id ? body.task : item)),
      );
      setRevision((value) => value + 1);
      setNotice(
        outcome === null
          ? "Ergebnisstatus entfernt."
          : "Ergebnisstatus gespeichert.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Ergebnis konnte nicht gespeichert werden.",
      );
    } finally {
      outcomeRequest.current = false;
      setOutcomePending(null);
    }
  }

  function navigate(amount: number) {
    if (view === "week") setAnchor(shiftDay(anchor, amount * 7));
    else {
      const date = new Date(`${month}-15T12:00:00Z`);
      date.setUTCMonth(date.getUTCMonth() + amount);
      setAnchor(date.toISOString().slice(0, 10));
    }
  }
  const header =
    view === "week"
      ? `${dateTitle(week[0])} – ${dateTitle(week[6])}`
      : monthTitle.format(new Date(`${month}-15T12:00:00Z`));

  return (
    <div className={styles.workspace}>
      <FollowUpSearch
        demo={demo}
        revision={revision}
        onSelect={(task) => {
          setAnchor(taskDay(task));
          setView("week");
          setTypeFilter("all");
          openEdit(task);
        }}
      />

      <section className={styles.intro}>
        <div>
          <span className={styles.eyebrow}>NACHFASSAKTIONEN</span>
          <h2>Follow-up-Kalender</h2>
          <p>
            Kundentermine und Wiedervorlagen direkt planen – ohne ein Angebot
            anzulegen.
          </p>
        </div>
        <button
          className={styles.primary}
          onClick={() => openNew()}
          disabled={demo || loading || !assignment.currentUserId}
        >
          <Plus size={17} /> Termin eintragen
        </button>
      </section>
      <section className={styles.weekSummary} aria-label="Wochenübersicht">
        <div className={styles.summaryHeading}>
          <strong>Wochenübersicht · KW {calendarWeek(anchor)}</strong>
          <span>
            {dateTitle(week[0])} – {dateTitle(week[6])} · Montag bis Sonntag
          </span>
        </div>
        <div className={styles.statCards} aria-busy={loading}>
          <div className={styles.statCard}>
            <CalendarDays size={20} aria-hidden="true" />
            <div>
              <strong>{loading ? "…" : weekTasks.length}</strong>
              <span>Termine gesamt</span>
            </div>
          </div>
          <div className={styles.statCard} data-type="follow_up">
            <CalendarDays size={20} aria-hidden="true" />
            <div>
              <strong>
                {loading
                  ? "…"
                  : weekTasks.filter(
                      (task) => task.appointment_type === "follow_up",
                    ).length}
              </strong>
              <span>Follow-ups</span>
            </div>
          </div>
          <div className={styles.statCard} data-type="phone">
            <Phone size={20} aria-hidden="true" />
            <div>
              <strong>
                {loading
                  ? "…"
                  : weekTasks.filter(
                      (task) => task.appointment_type === "phone",
                    ).length}
              </strong>
              <span>Telefontermine</span>
            </div>
          </div>
        </div>
        <p>
          Alle Termine der gewählten Woche, unabhängig von Suche und
          Terminart-Filter. Termine ohne Terminart zählen zur Gesamtzahl.
        </p>
      </section>
      {demo && (
        <p className={styles.info}>
          Im Demo-Modus sind keine Termine hinterlegt. Melde dich an, um deine
          Wiedervorlagen zu verwalten.
        </p>
      )}
      {notice && (
        <p className={styles.success} role="status">
          {notice}
        </p>
      )}
      {error && !editor && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <section
        className={styles.calendar}
        aria-label="Follow-up-Kalender"
        aria-busy={loading}
      >
        <div className={styles.toolbar}>
          <div className={styles.title}>
            <CalendarDays size={21} />
            <strong>{header}</strong>
          </div>
          <div
            className={styles.typeFilter}
            role="group"
            aria-label="Terminart"
          >
            {(["all", "follow_up", "phone"] as const).map((type) => (
              <button
                key={type}
                type="button"
                data-type={type}
                aria-pressed={typeFilter === type}
                onClick={() => setTypeFilter(type)}
              >
                {type === "follow_up" ? (
                  <CalendarDays size={14} aria-hidden="true" />
                ) : type === "phone" ? (
                  <Phone size={14} aria-hidden="true" />
                ) : null}
                {type === "all"
                  ? "Alle"
                  : type === "follow_up"
                    ? "Follow Up"
                    : "Telefon"}
              </button>
            ))}
          </div>
          <div className={styles.controls}>
            <button
              aria-label="Vorheriger Zeitraum"
              onClick={() => navigate(-1)}
            >
              <ChevronLeft size={17} />
            </button>
            <button onClick={() => setAnchor(dayFormat.format(new Date()))}>
              Heute
            </button>
            <button aria-label="Nächster Zeitraum" onClick={() => navigate(1)}>
              <ChevronRight size={17} />
            </button>
          </div>
          <div
            className={styles.switcher}
            role="group"
            aria-label="Kalenderansicht"
          >
            {(["week", "month", "list"] as const).map((item) => (
              <button
                key={item}
                aria-pressed={view === item}
                onClick={() => setView(item)}
              >
                {item === "week"
                  ? "Woche"
                  : item === "month"
                    ? "Monat"
                    : "Liste"}
              </button>
            ))}
          </div>
        </div>
        {loading && (
          <p className={styles.loading} role="status">
            Termine werden geladen …
          </p>
        )}
        {view === "week" ? (
          <>
            <div className={styles.weekScroll}>
              <div
                className={styles.weekGrid}
                style={{ gridTemplateColumns: `62px ${weekColumns.join(" ")}` }}
              >
                <div className={styles.corner}>Uhrzeit</div>
                {week.map((day) => (
                  <button
                    className={styles.dayHeader}
                    key={day}
                    onClick={() => openNew(day)}
                    disabled={demo}
                  >
                    <strong>{dateTitle(day)}</strong>
                    <span>{byDay.get(day)?.length ?? 0} Termine</span>
                  </button>
                ))}
                <div className={styles.timeAxis}>
                  {calendarHours.map((hour) => (
                    <div
                      key={hour}
                      className={styles.timeLabel}
                      style={{ height: CALENDAR_HOUR_HEIGHT }}
                    >
                      {String(hour).padStart(2, "0")}:00
                    </div>
                  ))}
                  <div className={styles.timeLabel}>{CALENDAR_END_HOUR}:00</div>
                </div>
                {week.map((day, index) => {
                  const events = weekLayouts[index];
                  const gridHeight =
                    (CALENDAR_END_HOUR - CALENDAR_START_HOUR) *
                    CALENDAR_HOUR_HEIGHT;
                  const bottom = Math.max(
                    gridHeight,
                    ...events.map((event) => event.top + event.height),
                  );
                  const lanes = Math.max(
                    1,
                    ...events.map((event) => event.lanes),
                  );
                  return (
                    <div
                      key={day}
                      className={styles.dayTimeline}
                      style={{
                        height: bottom + 32,
                        minWidth: lanes * 260,
                        backgroundSize: `100% ${CALENDAR_HOUR_HEIGHT}px`,
                      }}
                    >
                      {events.map(({ task, top, height, lane, lanes }) => (
                        <FollowUpOutcomeCard
                          key={task.id}
                          task={task}
                          onOutcome={changeOutcome}
                          disabled={
                            demo || loading || busy || outcomePending !== null
                          }
                          pending={outcomePending === task.id}
                          className={styles.event}
                          style={{
                            position: "absolute",
                            top,
                            minHeight: height,
                            left: `calc(${(lane / lanes) * 100}% + 5px)`,
                            width: `calc(${100 / lanes}% - 10px)`,
                          }}
                          title={`${timeTitle.format(new Date(task.start_time))}–${timeTitle.format(new Date(task.end_time))} · ${task.customer_name} · ${task.offer_subject} · ${statusName[task.status]}`}
                          onClick={() => openEdit(task)}
                        >
                          <span className={styles.eventHeading}>
                            <TypeBadge task={task} />
                            <strong>
                              {timeTitle.format(new Date(task.start_time))}–
                              {timeTitle.format(new Date(task.end_time))}
                            </strong>
                          </span>
                          <span>{task.customer_name}</span>
                          <small>{task.offer_subject}</small>
                          <small className={styles.eventStatus}>
                            {statusName[task.status]}
                          </small>
                        </FollowUpOutcomeCard>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
            {week
              .flatMap((day) => byDay.get(day) ?? [])
              .filter((task) => !isInCalendarGrid(task.start_time)).length >
              0 && (
              <div className={styles.outside}>
                <strong>Weitere Uhrzeiten</strong>
                {week
                  .flatMap((day) => byDay.get(day) ?? [])
                  .filter((task) => !isInCalendarGrid(task.start_time))
                  .map((task) => (
                    <FollowUpOutcomeCard
                      task={task}
                      onOutcome={changeOutcome}
                      disabled={
                        demo || loading || busy || outcomePending !== null
                      }
                      pending={outcomePending === task.id}
                      className={styles.event}
                      key={task.id}
                      onClick={() => openEdit(task)}
                    >
                      <TypeBadge task={task} />
                      {dateTitle(taskDay(task))} ·{" "}
                      {timeTitle.format(new Date(task.start_time))} ·{" "}
                      {timeTitle.format(new Date(task.end_time))}
                      <span>{task.customer_name}</span>
                      <small>{task.offer_subject}</small>
                      <small>{statusName[task.status]}</small>
                    </FollowUpOutcomeCard>
                  ))}
              </div>
            )}
          </>
        ) : view === "month" ? (
          <div className={styles.monthGrid}>
            {monthDays.map((day) => (
              <div
                key={day}
                className={styles.monthDay}
                data-outside={!day.startsWith(month)}
              >
                <button
                  className={styles.monthDate}
                  onClick={() => {
                    setAnchor(day);
                    setView("week");
                  }}
                >
                  {dateTitle(day)}
                </button>
                {(byDay.get(day) ?? []).map((task) => (
                  <FollowUpOutcomeCard
                    task={task}
                    onOutcome={changeOutcome}
                    disabled={
                      demo || loading || busy || outcomePending !== null
                    }
                    pending={outcomePending === task.id}
                    className={styles.event}
                    key={task.id}
                    onClick={() => openEdit(task)}
                  >
                    <span className={styles.eventHeading}>
                      <TypeBadge task={task} />
                      <strong>
                        {timeTitle.format(new Date(task.start_time))}–
                        {timeTitle.format(new Date(task.end_time))}
                      </strong>
                    </span>
                    <span>{task.customer_name}</span>
                    <small>{task.offer_subject}</small>
                    <small>{statusName[task.status]}</small>
                  </FollowUpOutcomeCard>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.list}>
            {shown.length === 0 ? (
              <p className={styles.empty}>
                In diesem Monat sind keine Termine eingetragen.
              </p>
            ) : (
              shown.map((task) => (
                <FollowUpOutcomeCard
                  task={task}
                  onOutcome={changeOutcome}
                  disabled={demo || loading || busy || outcomePending !== null}
                  pending={outcomePending === task.id}
                  list
                  key={task.id}
                  className={styles.listRow}
                  onClick={() => openEdit(task)}
                >
                  <span>
                    {dateTitle(taskDay(task))}
                    <br />
                    {timeTitle.format(new Date(task.start_time))}–
                    {timeTitle.format(new Date(task.end_time))}
                  </span>
                  <strong>
                    <TypeBadge task={task} />
                    {task.customer_name}
                    <small>
                      {task.offer_subject} · {task.title}
                    </small>
                    <small>Zuständig: {assigneeName(task.assigned_to)}</small>
                  </strong>
                  <em>{statusName[task.status]}</em>
                </FollowUpOutcomeCard>
              ))
            )}
          </div>
        )}
      </section>
      {editor && (
        <div
          className={styles.backdrop}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) setEditor(null);
          }}
        >
          <section
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="followup-dialog-title"
          >
            <div className={styles.modalHeader}>
              <div>
                <span className={styles.eyebrow}>KUNDENTERMIN</span>
                <h3 id="followup-dialog-title">
                  {editor === "new" ? "Termin eintragen" : "Termin bearbeiten"}
                </h3>
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
                Terminart
                <select
                  value={form.appointment_type}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      appointment_type: event.target.value as
                        AppointmentType | "",
                    })
                  }
                >
                  {editor !== "new" && <option value="">Ohne Terminart</option>}
                  <option value="follow_up">Follow-up</option>
                  <option value="phone">Telefontermin</option>
                </select>
              </label>
              <label>
                Bezeichnung
                <input
                  required
                  maxLength={120}
                  value={form.title}
                  onChange={(event) =>
                    setForm({ ...form, title: event.target.value })
                  }
                  placeholder="z. B. Follow-up Termin"
                />
              </label>
              <label>
                Kundenname
                <input
                  required
                  maxLength={120}
                  value={form.customer_name}
                  onChange={(event) =>
                    setForm({ ...form, customer_name: event.target.value })
                  }
                  placeholder="Vor- und Nachname"
                />
              </label>
              <label>
                Worum geht es? / Angebot
                <input
                  required
                  maxLength={180}
                  value={form.offer_subject}
                  onChange={(event) =>
                    setForm({ ...form, offer_subject: event.target.value })
                  }
                  placeholder="z. B. Rechtsschutz-Angebot besprechen"
                />
              </label>
              <div className={styles.formTwo}>
                <label>
                  Kunden-E-Mail <span>(optional)</span>
                  <input
                    type="email"
                    maxLength={254}
                    value={form.customer_email}
                    onChange={(event) =>
                      setForm({ ...form, customer_email: event.target.value })
                    }
                  />
                </label>
                <label>
                  Telefonnummer <span>(optional)</span>
                  <input
                    type="tel"
                    placeholder="+491701234567"
                    value={form.customer_phone}
                    onChange={(event) =>
                      setForm({ ...form, customer_phone: event.target.value })
                    }
                  />
                </label>
              </div>
              {(["start_time", "end_time"] as const).map((field) => (
                <fieldset key={field} className={styles.dateTimeGroup}>
                  <legend>
                    {field === "start_time" ? "Beginn" : "Ende"}{" "}
                    <span>(Berliner Zeit)</span>
                  </legend>
                  <div className={styles.dateTimeInputs}>
                    <label>
                      Datum
                      <input
                        required
                        type="date"
                        value={form[field].slice(0, 10)}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            [field]:
                              event.target.value + "T" + form[field].slice(11),
                          })
                        }
                      />
                    </label>
                    <label>
                      Uhrzeit
                      <input
                        required
                        type="time"
                        value={form[field].slice(11)}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            [field]:
                              form[field].slice(0, 10) +
                              "T" +
                              event.target.value,
                          })
                        }
                      />
                    </label>
                  </div>
                </fieldset>
              ))}
              <label>
                Zuständig
                <select
                  value={form.assigned_to}
                  disabled={
                    !assignment.canAssign ||
                    (editor !== "new" &&
                      editor.owner_id !== assignment.currentUserId)
                  }
                  onChange={(event) =>
                    setForm({ ...form, assigned_to: event.target.value })
                  }
                >
                  {!assignment.members.some(
                    (member) => member.id === form.assigned_to,
                  ) && (
                    <option value={form.assigned_to}>
                      {assigneeName(form.assigned_to)}
                    </option>
                  )}
                  {assignment.members
                    .filter(
                      (member) =>
                        assignment.canAssign ||
                        member.id === assignment.currentUserId,
                    )
                    .map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.full_name || "Ich"}
                        {member.id === assignment.currentUserId ? " (ich)" : ""}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Status
                <select
                  value={form.status}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      status: event.target.value as FollowUpStatus,
                    })
                  }
                >
                  <option value="pending">Offen</option>
                  <option value="rescheduled">Verschoben</option>
                  <option value="completed">Erledigt</option>
                </select>
              </label>
              <label>
                Notizen <span>(optional)</span>
                <textarea
                  maxLength={1000}
                  rows={3}
                  value={form.notes}
                  onChange={(event) =>
                    setForm({ ...form, notes: event.target.value })
                  }
                  placeholder="Gesprächsziel oder nächster Schritt"
                />
              </label>
              {error && (
                <p className={styles.error} role="alert">
                  {error}
                </p>
              )}
              <div className={styles.actions}>
                {editor !== "new" && (
                  <button
                    type="button"
                    className={styles.delete}
                    disabled={busy}
                    onClick={() => void remove(editor)}
                  >
                    Löschen
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setEditor(null)}
                  disabled={busy}
                >
                  Abbrechen
                </button>
                <button
                  className={styles.primary}
                  type="submit"
                  disabled={busy}
                >
                  {busy ? "Speichert …" : "Speichern"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
