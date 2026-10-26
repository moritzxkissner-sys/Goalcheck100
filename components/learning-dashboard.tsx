"use client";

import { useEffect, useState } from "react";
import {
  learningStatus,
  learningTracks,
  type LearningProgress,
} from "@/lib/learning";
import styles from "./learning-dashboard.module.css";

type Filter = "Alle" | "Offen" | "In Bearbeitung" | "Abgeschlossen";
const filters: Filter[] = ["Alle", "Offen", "In Bearbeitung", "Abgeschlossen"];

export default function LearningDashboard({ demo }: { demo: boolean }) {
  const [progress, setProgress] = useState<Record<string, LearningProgress>>(
    {},
  );
  const [filter, setFilter] = useState<Filter>("Alle");
  const [editing, setEditing] = useState<string | null>(null);
  const [completed, setCompleted] = useState(0);
  const [total, setTotal] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (demo) return;
    let active = true;
    fetch("/api/learning-progress", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok)
          throw new Error(
            body.error ?? "Lernstand konnte nicht geladen werden.",
          );
        return body;
      })
      .then((body) => {
        if (active)
          setProgress(
            Object.fromEntries(
              (body.progress as LearningProgress[]).map((row) => [
                row.track_id,
                row,
              ]),
            ),
          );
      })
      .catch((cause) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Lernstand konnte nicht geladen werden.",
          );
      });
    return () => {
      active = false;
    };
  }, [demo]);

  async function save(trackId: string) {
    if (demo || saving) return;
    if (
      !Number.isInteger(total) ||
      !Number.isInteger(completed) ||
      total < 1 ||
      total > 100 ||
      completed < 0 ||
      completed > total
    ) {
      setError(
        "Abgeschlossene Schritte müssen zwischen 0 und der Gesamtzahl liegen.",
      );
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/learning-progress", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          track_id: trackId,
          completed_units: completed,
          total_units: total,
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error ?? "Speichern fehlgeschlagen.");
      setProgress((previous) => ({ ...previous, [trackId]: body.progress }));
      setEditing(null);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Speichern fehlgeschlagen.",
      );
    } finally {
      setSaving(false);
    }
  }

  const tracked = Object.values(progress);
  const overall = tracked.length
    ? Math.round(
        (tracked.reduce(
          (sum, row) => sum + row.completed_units / row.total_units,
          0,
        ) /
          learningTracks.length) *
          100,
      )
    : 0;

  return (
    <section
      className={styles.dashboard}
      aria-labelledby="learning-dashboard-title"
    >
      <div className={styles.heading}>
        <div>
          <span className={styles.eyebrow}>DEINE LERNPFade</span>
          <h2 id="learning-dashboard-title">Mein Lernfortschritt</h2>
          <p>
            Fachberaterzertifizierungen und SalesPower Ausbildung im Überblick.
          </p>
        </div>
        <div className={styles.overall}>
          <strong>{overall} %</strong>
          <span>Selbst gepflegter Lernstand</span>
          <div className={styles.bar}>
            <span style={{ width: `${overall}%` }} />
          </div>
        </div>
      </div>
      <div
        className={styles.filters}
        role="group"
        aria-label="Lernstand filtern"
      >
        {filters.map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={filter === item}
            onClick={() => setFilter(item)}
          >
            {item}
          </button>
        ))}
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {(["Fachberaterzertifizierungen", "SalesPower Ausbildung"] as const).map(
        (group) => {
          const visible = learningTracks.filter(
            (track) =>
              track.group === group &&
              (filter === "Alle" ||
                learningStatus(
                  progress[track.id]?.completed_units ?? 0,
                  progress[track.id]?.total_units ?? 1,
                ) === filter),
          );
          return (
            <div className={styles.group} key={group}>
              <h3>{group}</h3>
              {visible.length === 0 ? (
                <p className={styles.empty}>
                  Keine Bereiche mit diesem Status.
                </p>
              ) : (
                <div className={styles.grid}>
                  {visible.map((track) => {
                    const row = progress[track.id];
                    const done = row?.completed_units ?? 0;
                    const count = row?.total_units ?? 1;
                    const percent = Math.round((done / count) * 100);
                    return (
                      <article className={styles.card} key={track.id}>
                        <div className={styles.cardTop}>
                          <span className={styles.icon}>✦</span>
                          <span className={styles.status}>
                            {learningStatus(done, count)}
                          </span>
                        </div>
                        <h4>{track.title}</h4>
                        <p>
                          {row
                            ? `${done} von ${count} Schritten`
                            : "Noch kein Lernstand erfasst"}
                        </p>
                        <div
                          className={styles.bar}
                          role="progressbar"
                          aria-label={`${track.title}: ${percent} Prozent`}
                          aria-valuenow={percent}
                          aria-valuemin={0}
                          aria-valuemax={100}
                        >
                          <span style={{ width: `${percent}%` }} />
                        </div>
                        {editing === track.id ? (
                          <div className={styles.editor}>
                            <label>
                              Erledigt
                              <input
                                type="number"
                                min={0}
                                max={100}
                                value={completed}
                                onChange={(event) =>
                                  setCompleted(Number(event.target.value))
                                }
                              />
                            </label>
                            <label>
                              Gesamt
                              <input
                                type="number"
                                min={1}
                                max={100}
                                value={total}
                                onChange={(event) =>
                                  setTotal(Number(event.target.value))
                                }
                              />
                            </label>
                            <button
                              disabled={saving}
                              onClick={() => void save(track.id)}
                            >
                              Speichern
                            </button>
                            <button onClick={() => setEditing(null)}>
                              Abbrechen
                            </button>
                          </div>
                        ) : (
                          <button
                            className={styles.editButton}
                            disabled={demo}
                            onClick={() => {
                              setEditing(track.id);
                              setCompleted(done);
                              setTotal(count);
                              setError("");
                            }}
                          >
                            Fortschritt eintragen
                          </button>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          );
        },
      )}
    </section>
  );
}

