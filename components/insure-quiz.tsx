"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Award,
  BookOpen,
  Building2,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  GraduationCap,
  HeartPulse,
  History,
  House,
  LockKeyhole,
  Play,
  RotateCcw,
  Scale,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import {
  academyCatalogVersion,
  academyQuestions,
  academyTracks,
  scoreAcademyAnswers,
  type AcademyAttempt,
  type AcademyProgress,
  type AcademyProgressInput,
} from "@/lib/academy";
import styles from "./insure-quiz.module.css";

type Group = "specialist" | "salespower";
type AcademyDocument = {
  id: string;
  title: string;
  document_version: string;
  module_id: string | null;
  processing_status: string;
  valid_from: string | null;
};
const groupNames = {
  specialist: "Fachberaterzertifizierungen",
  salespower: "SalesPower Ausbildung",
};
const filters = ["Alle", "Offen", "In Bearbeitung", "Abgeschlossen"] as const;
const icons = [
  House,
  Building2,
  HeartPulse,
  Users,
  HeartPulse,
  Users,
  Scale,
  House,
  ShieldCheck,
  Building2,
  ShieldCheck,
];
const accents = [
  "#ff777e",
  "#46aaff",
  "#28d4bb",
  "#c27aff",
  "#46aaff",
  "#28d4bb",
  "#edb951",
  "#ad84ff",
  "#46aaff",
  "#b88aff",
  "#ff777e",
];
const isCorrect = (answer: number[] | null | undefined, expected: number[]) =>
  !!answer &&
  answer.length === expected.length &&
  expected.every((value) => answer.includes(value));

export default function InsureQuiz({
  demo = false,
  userId,
}: {
  demo?: boolean;
  userId?: string;
}) {
  return (
    <Academy
      key={`${demo ? "demo" : "account"}:${userId ?? "current"}`}
      demo={demo}
    />
  );
}

function Academy({ demo }: { demo: boolean }) {
  const [group, setGroup] = useState<Group | null>(null);
  const [trackId, setTrackId] = useState<string | null>(null);
  const [moduleId, setModuleId] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof filters)[number]>("Alle");
  const [progress, setProgress] = useState<AcademyProgress[]>([]);
  const [attempts, setAttempts] = useState<AcademyAttempt[]>([]);
  const [documents, setDocuments] = useState<AcademyDocument[]>([]);
  const [round, setRound] = useState<AcademyProgress | null>(null);
  const [selection, setSelection] = useState<number[]>([]);
  const [loading, setLoading] = useState(!demo);
  const [busy, setBusy] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState("");
  const retry = useRef<(() => void) | null>(null);
  const active = useRef(true);
  const pending = useRef(false);

  useEffect(() => {
    active.current = true;
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/academy", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok)
          throw new Error("Dein Lernstand konnte nicht geladen werden.");
        const data = (await response.json()) as {
          progress: AcademyProgress[];
          attempts: AcademyAttempt[];
          documents?: AcademyDocument[];
        };
        if (active.current) {
          setProgress(data.progress);
          setAttempts(data.attempts);
          setDocuments(data.documents ?? []);
          setError("");
          setLoadFailed(false);
          setLoading(false);
          retry.current = null;
        }
      } catch (caught) {
        if (controller.signal.aborted || !active.current) return;
        setError(
          caught instanceof Error ? caught.message : "Laden fehlgeschlagen.",
        );
        retry.current = () => {
          setLoading(true);
          void load();
        };
        setLoadFailed(true);
        setLoading(false);
      }
    }
    if (!demo) void load();
    return () => {
      active.current = false;
      controller.abort();
    };
  }, [demo]);

  const track = academyTracks.find((item) => item.id === trackId);
  const lessonModule = track?.modules.find((item) => item.id === moduleId);
  const questions =
    lessonModule?.questionIds.map((id) =>
      academyQuestions.find((question) => question.id === id)!,
    ) ?? [];
  const current = round ? questions[round.position] : undefined;
  const checked = !!round && round.answers[round.position] != null;
  const completedIds = new Set(
    [...progress.filter((row) => row.completed), ...attempts]
      .filter((row) => row.catalog_version === academyCatalogVersion)
      .map((row) => row.module_id),
  );
  const count = (ids: string[]) =>
    ids.filter((id) => completedIds.has(id)).length;
  const allModules = academyTracks.flatMap((item) => item.modules);
  const totalDone = count(allModules.map((item) => item.id));
  const percentage = Math.round((totalDone / allModules.length) * 100);
  const moduleStatus = (id: string) =>
    completedIds.has(id)
      ? "Abgeschlossen"
      : progress.some(
            (row) =>
              row.module_id === id &&
              row.catalog_version === academyCatalogVersion,
          )
        ? "In Bearbeitung"
        : "Offen";
  const trackStatus = (id: string) => {
    const modules = academyTracks.find((item) => item.id === id)!.modules;
    return modules.every((item) => completedIds.has(item.id))
      ? "Abgeschlossen"
      : modules.some((item) => moduleStatus(item.id) !== "Offen")
        ? "In Bearbeitung"
        : "Offen";
  };

  async function save(input: AcademyProgressInput, after?: () => void) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      let saved: AcademyProgress;
      if (demo)
        saved = {
          ...input,
          catalog_version: academyCatalogVersion,
          updated_at: new Date().toISOString(),
          score: scoreAcademyAnswers(input.module_id, input.answers),
        };
      else {
        const response = await fetch("/api/academy", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        if (!response.ok)
          throw new Error(
            "Dein Fortschritt konnte nicht gespeichert werden. Bitte versuche es erneut.",
          );
        saved = ((await response.json()) as { progress: AcademyProgress })
          .progress;
      }
      if (!active.current) return;
      setProgress((rows) => [
        ...rows.filter((row) => row.module_id !== saved.module_id),
        saved,
      ]);
      setRound(saved);
      if (saved.completed)
        setAttempts((rows) => [
          {
            module_id: saved.module_id,
            attempt_id: saved.attempt_id,
            answers: saved.answers,
            catalog_version: saved.catalog_version,
            created_at: saved.updated_at,
            score: saved.score,
          },
          ...rows.filter((row) => row.attempt_id !== saved.attempt_id),
        ]);
      retry.current = null;
      after?.();
    } catch (caught) {
      if (active.current) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Speichern fehlgeschlagen.",
        );
        retry.current = () => void save(input, after);
      }
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }

  function start(repeat = false) {
    if (!lessonModule || lessonModule.requiresDocuments || !questions.length)
      return;
    const existing = progress.find(
      (row) =>
        row.module_id === lessonModule.id &&
        row.catalog_version === academyCatalogVersion,
    );
    setSelection([]);
    if (existing && !repeat) {
      setRound(existing);
      return;
    }
    void save({
      module_id: lessonModule.id,
      attempt_id: crypto.randomUUID(),
      answers: questions.map(() => null),
      position: 0,
      completed: false,
    });
  }
  function goHome() {
    setGroup(null);
    setTrackId(null);
    setModuleId(null);
    setRound(null);
    setFilter("Alle");
  }
  function openGroup(value: Group) {
    setGroup(value);
    setTrackId(null);
    setModuleId(null);
    setRound(null);
    setFilter("Alle");
  }
  const title =
    lessonModule?.title ??
    track?.title ??
    (group ? groupNames[group] : "Willkommen in deinem Lernbereich");
  const history = attempts.filter(
    (item) =>
      item.module_id === moduleId &&
      item.catalog_version === academyCatalogVersion,
  );

  return (
    <section className={styles.academy} aria-label="InsureQuiz Lernbereich">
      <nav className={styles.breadcrumbs} aria-label="Brotkrumennavigation">
        <button onClick={goHome} disabled={busy || !!error}>
          Lernbereich
        </button>
        {group && (
          <>
            <ChevronRight size={14} />
            <button disabled={busy || !!error} onClick={() => openGroup(group)}>
              {groupNames[group]}
            </button>
          </>
        )}
        {track && (
          <>
            <ChevronRight size={14} />
            <button
              disabled={busy || !!error}
              onClick={() => {
                setModuleId(null);
                setRound(null);
              }}
            >
              {track.title}
            </button>
          </>
        )}
        {lessonModule && (
          <>
            <ChevronRight size={14} />
            <span>{lessonModule.title}</span>
          </>
        )}
      </nav>
      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>DEINE WEITERBILDUNG</span>
          <h2>{title}</h2>
          <p>
            {lessonModule
              ? lessonModule.description
              : track
                ? track.description
                : group
                  ? "Wähle deinen Themenbereich und lerne in deinem eigenen Tempo."
                  : "Erweitere dein Fachwissen. Stärke deine Beratung. Gestalte deinen nächsten Schritt."}
          </p>
        </div>
        <div className={styles.overall}>
          <div
            className={styles.ring}
            style={{ "--progress": `${percentage}%` } as CSSProperties}
          >
            <strong>{percentage}%</strong>
          </div>
          <div>
            <strong>Dein Lernfortschritt</strong>
            <span>
              {totalDone} von {allModules.length} Modulen abgeschlossen
            </span>
            <div className={styles.bar}>
              <i style={{ width: `${percentage}%` }} />
            </div>
          </div>
        </div>
      </div>
      {demo && (
        <div className={styles.notice}>
          <Sparkles size={16} /> Demo-Lernbereich · Dein Fortschritt bleibt für
          diese Sitzung erhalten.
        </div>
      )}
      {error && (
        <div className={styles.error} role="alert">
          <span>{error}</span>
          <button disabled={busy || loading} onClick={() => retry.current?.()}>
            <RotateCcw size={15} /> Erneut versuchen
          </button>
        </div>
      )}
      {loading ? (
        <div className={styles.empty} role="status">
          Dein Lernbereich wird geladen …
        </div>
      ) : loadFailed ? (
        <div className={styles.empty}>
          Bitte lade deinen Lernstand erneut, bevor du fortfährst.
        </div>
      ) : (
        <>
          {!group && (
            <div className={styles.heroGrid}>
              {(["specialist", "salespower"] as const).map((value) => {
                const modules = academyTracks
                  .filter((item) => item.group === value)
                  .flatMap((item) => item.modules);
                const done = count(modules.map((item) => item.id));
                const Icon = value === "specialist" ? Award : GraduationCap;
                return (
                  <button
                    key={value}
                    className={`${styles.heroCard} ${value === "specialist" ? styles.gold : styles.blue}`}
                    onClick={() => openGroup(value)}
                  >
                    <div className={styles.heroArt} aria-hidden="true">
                      <div className={styles.orbit} />
                      <Icon className={styles.heroSymbol} strokeWidth={1.1} />
                      <span className={styles.artBadge}>
                        <ShieldCheck size={25} />
                      </span>
                    </div>
                    <span className={styles.cardEyebrow}>
                      {value === "specialist"
                        ? "DEINE SPEZIALISIERUNG"
                        : "WISSEN FÜR DIE PRAXIS"}
                    </span>
                    <h3>{groupNames[value]}</h3>
                    <p>
                      {value === "specialist"
                        ? "Vertiefe deine fachliche Kompetenz in vier Themenbereichen. Dein Einstieg in die spezialisierte Weiterbildung."
                        : "Entdecke sieben Themenbereiche rund um Versicherung und Beratung. Mit Lerninhalten und interaktiven Übungsfragen."}
                    </p>
                    <div className={styles.heroFoot}>
                      <span>
                        {done} von {modules.length} Modulen abgeschlossen
                      </span>
                      <div className={styles.bar}>
                        <i
                          style={{ width: `${(done / modules.length) * 100}%` }}
                        />
                      </div>
                      <span className={styles.cardAction}>
                        Jetzt entdecken <ArrowRight size={21} />
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          {group && !track && (
            <>
              <div className={styles.toolbar}>
                <span>
                  {academyTracks.filter((item) => item.group === group).length}{" "}
                  Themenbereiche
                </span>
                <div className={styles.filters} aria-label="Statusfilter">
                  {filters.map((value) => (
                    <button
                      key={value}
                      aria-pressed={filter === value}
                      onClick={() => setFilter(value)}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>
              <div
                className={`${styles.trackGrid} ${group === "salespower" ? styles.salesGrid : ""}`}
              >
                {academyTracks
                  .filter(
                    (item) =>
                      item.group === group &&
                      (filter === "Alle" || trackStatus(item.id) === filter),
                  )
                  .map((item) => {
                    const index = academyTracks.indexOf(item);
                    const Icon = icons[index];
                    const done = count(item.modules.map((entry) => entry.id));
                    const waiting = item.modules.every(
                      (entry) => entry.requiresDocuments,
                    );
                    return (
                      <button
                        key={item.id}
                        className={styles.trackCard}
                        style={{ "--accent": accents[index] } as CSSProperties}
                        onClick={() => {
                          setTrackId(item.id);
                          setFilter("Alle");
                        }}
                      >
                        <div className={styles.trackArt} aria-hidden="true">
                          <Icon
                            className={styles.trackSymbol}
                            strokeWidth={1}
                          />
                          <span className={styles.iconBubble}>
                            <Icon size={28} />
                          </span>
                        </div>
                        <span className={styles.status}>
                          {waiting
                            ? "Unterlagen ausstehend"
                            : trackStatus(item.id)}
                        </span>
                        <h3>{item.title}</h3>
                        <p>
                          {waiting
                            ? "Dein Lernpfad ist vorbereitet. Die Schulungsunterlagen werden noch ergänzt."
                            : item.description}
                        </p>
                        <div className={styles.trackFoot}>
                          <span>
                            {done} von {item.modules.length} Modulen
                            abgeschlossen
                          </span>
                          <div className={styles.bar}>
                            <i
                              style={{
                                width: `${(done / item.modules.length) * 100}%`,
                              }}
                            />
                          </div>
                          <span className={styles.cardAction}>
                            Lernbereich öffnen <ChevronRight size={18} />
                          </span>
                        </div>
                      </button>
                    );
                  })}
              </div>
              {!academyTracks.some(
                (item) =>
                  item.group === group &&
                  (filter === "Alle" || trackStatus(item.id) === filter),
              ) && (
                <div className={styles.empty}>
                  Keine Themenbereiche mit diesem Status.
                </div>
              )}
            </>
          )}
          {track && !lessonModule && (
            <div className={styles.moduleList}>
              {track.modules.map((item, index) => (
                <button
                  className={styles.moduleRow}
                  key={item.id}
                  onClick={() => {
                    setModuleId(item.id);
                    setRound(null);
                    setSelection([]);
                  }}
                >
                  <span className={styles.moduleNumber}>
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <span className={styles.eyebrow}>
                      {item.requiresDocuments
                        ? "UNTERLAGEN AUSSTEHEND"
                        : moduleStatus(item.id)}
                    </span>
                    <h3>{item.title}</h3>
                    <p>{item.description}</p>
                  </div>
                  <span className={styles.moduleMeta}>
                    {item.requiresDocuments ? (
                      <LockKeyhole size={20} />
                    ) : (
                      <>
                        <BookOpen size={17} /> {item.questionIds.length} Fragen
                      </>
                    )}
                    <ChevronRight size={20} />
                  </span>
                </button>
              ))}
            </div>
          )}
          {lessonModule && !round && (
            <div className={styles.lessonLayout}>
              <article className={styles.panel}>
                <span className={styles.eyebrow}>DEIN LERNMODUL</span>
                <h3>
                  {lessonModule.requiresDocuments
                    ? "Dieser Lerninhalt wird vorbereitet"
                    : "Wissen, das dich weiterbringt"}
                </h3>
                {lessonModule.requiresDocuments ? (
                  <div className={styles.waiting}>
                    <LockKeyhole size={34} />
                    <p>
                      {documents.some(
                        (document) => document.module_id === lessonModule.id,
                      )
                        ? "Die freigegebenen Unterlagen findest du unter deinen Quellen. Lerninhalte und passende Quizfragen werden nach fachlicher Aufbereitung ergänzt."
                        : "Für diesen Themenbereich liegen noch keine Schulungsunterlagen vor. Sobald sie ergänzt sind, können hier Lerninhalte und passende Quizfragen bereitgestellt werden."}
                    </p>
                    <span>Aktuell ist kein Quiz verfügbar.</span>
                  </div>
                ) : (
                  <>
                    <div className={styles.lessonContent}>
                      {lessonModule.content.map((paragraph, index) => (
                        <div key={index}>
                          <span>{String(index + 1).padStart(2, "0")}</span>
                          <p>{paragraph}</p>
                        </div>
                      ))}
                    </div>
                    <button
                      className={styles.primary}
                      disabled={busy || !!error}
                      onClick={() => start()}
                    >
                      <Play size={17} />
                      {busy
                        ? "Wird gespeichert …"
                        : progress.some(
                              (row) =>
                                row.module_id === lessonModule.id &&
                                !row.completed,
                            )
                          ? "Quiz fortsetzen"
                          : moduleStatus(lessonModule.id) === "Abgeschlossen"
                            ? "Ergebnis ansehen"
                            : "Quiz starten"}
                      <ArrowRight size={17} />
                    </button>
                  </>
                )}
              </article>
              <aside className={styles.panel}>
                <FileText className={styles.sideIcon} size={25} />
                <h3>Deine Quellen</h3>
                {documents.some(
                  (document) => document.module_id === lessonModule.id,
                ) && (
                  <ul className={styles.sources}>
                    {documents
                      .filter(
                        (document) => document.module_id === lessonModule.id,
                      )
                      .map((document) => (
                        <li key={document.id}>
                          <a
                            href={`/api/training-documents/${encodeURIComponent(document.id)}/download`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {document.title} · Version{" "}
                            {document.document_version}
                          </a>
                        </li>
                      ))}
                  </ul>
                )}
                {lessonModule.requiresDocuments ? (
                  <p>
                    {documents.some(
                      (document) => document.module_id === lessonModule.id,
                    )
                      ? "Dokumente sind verfügbar. Die Aufbereitung als Lerninhalt und Quiz steht noch aus."
                      : "Schulungsdokumente ausstehend."}
                  </p>
                ) : (
                  <>
                    <p>
                      Allgemeine Grundlagen aus dem bisherigen GoalTrack
                      InsureQuiz. Diese Übungen ersetzen keine
                      produktspezifischen Schulungsunterlagen.
                    </p>
                    <ul className={styles.sources}>
                      {Array.from(
                        new Set(
                          questions.map((question) => question.source.title),
                        ),
                      ).map((source) => (
                        <li key={source}>{source}</li>
                      ))}
                    </ul>
                  </>
                )}
                <div className={styles.divider} />
                <History size={21} />
                <h3>Bisherige Durchläufe</h3>
                {history.length ? (
                  <ul className={styles.history}>
                    {history.map((item) => (
                      <li key={item.attempt_id}>
                        <span>
                          {new Date(item.created_at).toLocaleDateString(
                            "de-DE",
                          )}
                          <small>
                            {item.score.correct} von {item.score.total} richtig
                          </small>
                        </span>
                        <strong>{item.score.percentage}%</strong>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>Noch kein abgeschlossener Durchlauf.</p>
                )}
              </aside>
            </div>
          )}
          {lessonModule && round && !round.completed && current && (
            <article className={`${styles.panel} ${styles.quizPanel}`}>
              <div className={styles.quizTop}>
                <span className={styles.eyebrow}>
                  WISSENSCHECK · {current.topic}
                </span>
                <span>
                  Frage {round.position + 1} von {questions.length}
                </span>
              </div>
              <div className={styles.bar}>
                <i
                  style={{
                    width: `${(round.position / questions.length) * 100}%`,
                  }}
                />
              </div>
              <h3>{current.prompt}</h3>
              <p>
                {current.correctAnswers.length > 1
                  ? "Mehrfachauswahl · Wähle alle passenden Antworten."
                  : "Einfachauswahl · Eine Antwort ist richtig."}
              </p>
              <fieldset className={styles.choices} disabled={busy || checked}>
                <legend className={styles.srOnly}>Antwort auswählen</legend>
                {current.choices.map((choice, index) => {
                  const chosen = checked
                    ? round.answers[round.position]!.includes(index)
                    : selection.includes(index);
                  return (
                    <label
                      key={choice}
                      className={`${styles.choice} ${chosen ? styles.selected : ""} ${checked && current.correctAnswers.includes(index) ? styles.correctChoice : ""} ${checked && chosen && !current.correctAnswers.includes(index) ? styles.wrongChoice : ""}`}
                    >
                      <input
                        type={
                          current.correctAnswers.length > 1
                            ? "checkbox"
                            : "radio"
                        }
                        name={`question-${round.attempt_id}-${current.id}`}
                        checked={chosen}
                        onChange={() =>
                          setSelection((previous) =>
                            current.correctAnswers.length > 1
                              ? previous.includes(index)
                                ? previous.filter((value) => value !== index)
                                : [...previous, index]
                              : [index],
                          )
                        }
                      />
                      <span>{choice}</span>
                      {checked && current.correctAnswers.includes(index) && (
                        <Check size={19} />
                      )}
                      {checked &&
                        chosen &&
                        !current.correctAnswers.includes(index) && (
                          <X size={19} />
                        )}
                    </label>
                  );
                })}
              </fieldset>
              {checked && (
                <div
                  className={`${styles.feedback} ${isCorrect(round.answers[round.position], current.correctAnswers) ? styles.good : styles.bad}`}
                  role="status"
                >
                  <strong>
                    {isCorrect(
                      round.answers[round.position],
                      current.correctAnswers,
                    )
                      ? "Richtig beantwortet"
                      : "Noch nicht ganz richtig"}
                  </strong>
                  <p>{current.explanation}</p>
                  <small>
                    Quelle:{" "}
                    {current.source.url ? (
                      <a
                        href={current.source.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {current.source.title}
                      </a>
                    ) : (
                      current.source.title
                    )}
                  </small>
                </div>
              )}
              <div className={styles.quizActions}>
                <button
                  className={styles.textButton}
                  disabled={busy || !!error}
                  onClick={() => {
                    setRound(null);
                    setSelection([]);
                  }}
                >
                  <ArrowLeft size={16} /> Zur Modulübersicht
                </button>
                <button
                  className={styles.primary}
                  disabled={
                    busy || !!error || (!checked && selection.length === 0)
                  }
                  onClick={() => {
                    if (!checked) {
                      const answers = [...round.answers];
                      answers[round.position] = [...selection].sort(
                        (a, b) => a - b,
                      );
                      void save({ ...round, answers });
                    } else {
                      const position = round.position + 1;
                      void save(
                        {
                          ...round,
                          position,
                          completed: position === questions.length,
                        },
                        () => setSelection([]),
                      );
                    }
                  }}
                >
                  {busy
                    ? "Wird gespeichert …"
                    : checked
                      ? round.position + 1 === questions.length
                        ? "Ergebnis anzeigen"
                        : "Nächste Frage"
                      : "Antwort prüfen"}
                  <ArrowRight size={17} />
                </button>
              </div>
              <p className={styles.saveHint}>
                <Clock3 size={13} /> Geprüfte Antworten und dein Lernstand
                werden {demo ? "in dieser Sitzung" : "in deinem Konto"}{" "}
                gespeichert.
              </p>
            </article>
          )}
          {lessonModule && round?.completed && (
            <article className={`${styles.panel} ${styles.results}`}>
              <div className={styles.resultIcon}>
                <CheckCircle2 size={39} />
              </div>
              <span className={styles.eyebrow}>DEIN ERGEBNIS</span>
              <h3>Lernmodul abgeschlossen</h3>
              <p>Jeder Durchlauf macht dein Wissen ein Stück sicherer.</p>
              <div className={styles.scoreGrid}>
                <div>
                  <strong>{round.score.percentage}%</strong>
                  <span>Richtig beantwortet</span>
                </div>
                <div>
                  <strong>{round.score.correct}</strong>
                  <span>Richtige Antworten</span>
                </div>
                <div>
                  <strong>{round.score.total - round.score.correct}</strong>
                  <span>Falsche Antworten</span>
                </div>
              </div>
              {questions.some(
                (question, index) =>
                  !isCorrect(round.answers[index], question.correctAnswers),
              ) && (
                <div className={styles.review}>
                  <h4>Diese Fragen kannst du noch festigen</h4>
                  {questions
                    .filter(
                      (question, index) =>
                        !isCorrect(
                          round.answers[index],
                          question.correctAnswers,
                        ),
                    )
                    .map((question) => (
                      <details key={question.id}>
                        <summary>{question.prompt}</summary>
                        <p>
                          <strong>Richtige Antwort:</strong>{" "}
                          {question.correctAnswers
                            .map((index) => question.choices[index])
                            .join(" · ")}
                        </p>
                        <p>{question.explanation}</p>
                        <small>Quelle: {question.source.title}</small>
                      </details>
                    ))}
                </div>
              )}
              <div className={styles.resultActions}>
                <button
                  className={styles.textButton}
                  disabled={busy || !!error}
                  onClick={() => setRound(null)}
                >
                  <History size={17} /> Modul & Verlauf
                </button>
                <button
                  className={styles.primary}
                  disabled={busy || !!error}
                  onClick={() => start(true)}
                >
                  <RotateCcw size={17} />
                  {busy ? "Wird gespeichert …" : "Quiz wiederholen"}
                </button>
              </div>
            </article>
          )}
        </>
      )}
      <p className={styles.footer}>
        <ShieldCheck size={15} /> Dein Lernfortschritt zählt. Die Übungen
        stellen keine offizielle Zertifizierung dar.
      </p>
    </section>
  );
}

