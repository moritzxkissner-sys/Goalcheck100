"use client";

import { useState, type FormEvent } from "react";
import { Check, ChevronRight, RotateCcw, X } from "lucide-react";
import styles from "./insure-quiz.module.css";

type Question = {
  id: string;
  topic: string;
  prompt: string;
  choices: [string, string, string];
  correct: number;
  explanation: string;
};

const questions: Question[] = [
  {
    id: "hausrat",
    topic: "Sachversicherung",
    prompt:
      "Ein Wasserschaden beschädigt das frei stehende Sofa. Welche Versicherung ist für den Hausrat grundsätzlich zuständig?",
    choices: [
      "Hausratversicherung",
      "Wohngebäudeversicherung",
      "Privathaftpflichtversicherung",
    ],
    correct: 0,
    explanation:
      "Bewegliche Einrichtungsgegenstände gehören zum Hausrat. Ob der konkrete Leitungswasserschaden versichert ist, hängt vom Vertrag ab.",
  },
  {
    id: "gebaeude",
    topic: "Sachversicherung",
    prompt:
      "Ein Sturm beschädigt das Dach eines Hauses. Was ist grundsätzlich der passende Versicherungsschutz?",
    choices: [
      "Hausratversicherung",
      "Wohngebäudeversicherung",
      "Rechtsschutzversicherung",
    ],
    correct: 1,
    explanation:
      "Das Dach ist Teil des Gebäudes. Schäden daran fallen grundsätzlich in den Bereich der Wohngebäudeversicherung; maßgeblich sind die Bedingungen.",
  },
  {
    id: "haftpflicht",
    topic: "Haftpflicht",
    prompt:
      "Welche Aufgabe hat eine Privathaftpflichtversicherung bei einem Schadenersatzanspruch?",
    choices: [
      "Sie zahlt jede Forderung sofort",
      "Sie prüft den Anspruch und übernimmt berechtigte Forderungen",
      "Sie ersetzt Schäden am eigenen Hausrat",
    ],
    correct: 1,
    explanation:
      "Der Versicherer prüft zunächst, ob der Anspruch berechtigt ist. Berechtigte Ansprüche reguliert er im Rahmen des Vertrags.",
  },
  {
    id: "selbstbeteiligung",
    topic: "Vertragsbegriffe",
    prompt: "Was bedeutet eine vereinbarte Selbstbeteiligung?",
    choices: [
      "Der Kunde trägt einen vereinbarten Anteil des Schadens selbst",
      "Der Versicherer zahlt immer doppelt",
      "Der Beitrag entfällt im Schadenfall",
    ],
    correct: 0,
    explanation:
      "Die Selbstbeteiligung ist der Eigenanteil, den die versicherte Person im Schadenfall gemäß Vertrag trägt.",
  },
  {
    id: "rechtsschutz",
    topic: "Rechtsschutz",
    prompt: "Wobei kann eine Rechtsschutzversicherung je nach Vertrag helfen?",
    choices: [
      "Bei Kosten eines versicherten Rechtsstreits",
      "Bei der Reparatur eines Sturmschadens",
      "Bei jeder beliebigen Geldstrafe",
    ],
    correct: 0,
    explanation:
      "Rechtsschutz kann etwa Anwalts- und Gerichtskosten für versicherte Streitigkeiten tragen. Umfang, Ausschlüsse und Wartezeiten stehen im Vertrag.",
  },
  {
    id: "bedingungen",
    topic: "Beratung",
    prompt:
      "Wo prüfst du, ob ein konkreter Schaden und seine Ursache versichert sind?",
    choices: [
      "Nur am Produktnamen",
      "In den vereinbarten Versicherungsbedingungen",
      "Allein an der Beitragshöhe",
    ],
    correct: 1,
    explanation:
      "Versicherte Gefahren, Ausschlüsse, Grenzen und Selbstbeteiligungen ergeben sich aus den vereinbarten Bedingungen.",
  },
  {
    id: "elementar",
    topic: "Sachversicherung",
    prompt:
      "Welcher Schaden erfordert in der Regel einen zusätzlichen Elementarschutz?",
    choices: [
      "Überschwemmung",
      "Einbruchdiebstahl",
      "Ein zerbrochenes Trinkglas",
    ],
    correct: 0,
    explanation:
      "Überschwemmung zählt zu den Elementargefahren. Ob sie versichert ist, muss im konkreten Vertrag geprüft werden.",
  },
  {
    id: "versicherungssumme",
    topic: "Vertragsbegriffe",
    prompt: "Warum ist neben dem Beitrag auch die Versicherungssumme wichtig?",
    choices: [
      "Sie kann die maximale Entschädigung begrenzen",
      "Sie ersetzt immer die Selbstbeteiligung",
      "Sie legt den Schadenzeitpunkt fest",
    ],
    correct: 0,
    explanation:
      "Ein Vertrag kann die Leistung pro Versicherungsfall durch eine vereinbarte Versicherungssumme oder Entschädigungsgrenze begrenzen.",
  },
];

const storageKey = "goaltrack-insurequiz-v1";
const roundLength = 6;

type Round = {
  ids: string[];
  index: number;
  answers: (number | null)[];
  checked: boolean;
};

function isValidRound(value: unknown): value is Round {
  if (!value || typeof value !== "object") return false;
  const round = value as Partial<Round>;
  return (
    Array.isArray(round.ids) &&
    round.ids.length === roundLength &&
    new Set(round.ids).size === roundLength &&
    round.ids.every(
      (id) =>
        typeof id === "string" &&
        questions.some((question) => question.id === id),
    ) &&
    Number.isInteger(round.index) &&
    typeof round.index === "number" &&
    round.index >= 0 &&
    round.index <= roundLength &&
    Array.isArray(round.answers) &&
    round.answers.length === roundLength &&
    round.answers.every(
      (answer) =>
        answer === null ||
        (Number.isInteger(answer) && answer >= 0 && answer < 3),
    ) &&
    typeof round.checked === "boolean"
  );
}

function loadRound(): Round | null {
  try {
    const stored = window.sessionStorage.getItem(storageKey);
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    return isValidRound(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function createRound(): Round {
  const ids = questions
    .map((question) => question.id)
    .sort(() => Math.random() - 0.5)
    .slice(0, roundLength);
  return {
    ids,
    index: 0,
    answers: Array(roundLength).fill(null),
    checked: false,
  };
}

export default function InsureQuiz() {
  const [round, setRound] = useState<Round | null>(null);
  const [selection, setSelection] = useState<number | null>(null);
  const [error, setError] = useState("");

  const updateRound = (next: Round) => {
    setRound(next);
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // The quiz remains usable when browser storage is unavailable.
    }
  };

  const start = (fresh = false) => {
    const next = (fresh ? null : loadRound()) ?? createRound();
    updateRound(next);
    setSelection(next.answers[next.index] ?? null);
    setError("");
  };

  if (!round) {
    return (
      <section
        className={`glass ${styles.card}`}
        aria-labelledby="insurequiz-intro-title"
      >
        <span className="eyebrow">INSUREQUIZ</span>
        <h2 id="insurequiz-intro-title">Sechs Fragen. Direktes Feedback.</h2>
        <p>
          Übe Grundlagen zu Haftpflicht, Sachversicherung, Rechtsschutz und
          wichtigen Vertragsbegriffen. Deine Runde bleibt während dieser
          Browser-Sitzung gespeichert.
        </p>
        <button className="primary" onClick={() => start()}>
          Quiz starten oder fortsetzen{" "}
          <ChevronRight size={17} aria-hidden="true" />
        </button>
      </section>
    );
  }

  if (round.index === roundLength) {
    const score = round.ids.reduce((total, id, index) => {
      const question = questions.find((item) => item.id === id);
      return total + (question?.correct === round.answers[index] ? 1 : 0);
    }, 0);
    return (
      <section
        className={`glass ${styles.card}`}
        aria-labelledby="insurequiz-result-title"
      >
        <span className="eyebrow">RUNDE ABGESCHLOSSEN</span>
        <h2 id="insurequiz-result-title">
          {score} von {roundLength} richtig
        </h2>
        <p>
          {score === roundLength
            ? "Stark! Alle Grundlagen sitzen."
            : "Gut geübt. Jede Erklärung hilft dir bei der nächsten Runde."}
        </p>
        <div className={styles.resultList}>
          {round.ids.map((id, index) => {
            const question = questions.find((item) => item.id === id)!;
            const correct = question.correct === round.answers[index];
            return (
              <div key={id}>
                <span className={correct ? styles.correct : styles.incorrect}>
                  {correct ? <Check size={16} /> : <X size={16} />}
                </span>
                <span>
                  {question.topic}: {question.prompt}
                </span>
              </div>
            );
          })}
        </div>
        <button className="primary" onClick={() => start(true)}>
          <RotateCcw size={17} aria-hidden="true" /> Neue Runde
        </button>
      </section>
    );
  }

  const question = questions.find(
    (item) => item.id === round.ids[round.index],
  )!;
  const answer = round.answers[round.index];
  const isCorrect = answer === question.correct;

  const checkAnswer = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (selection === null) {
      setError("Bitte wähle eine Antwort aus.");
      return;
    }
    const answers = [...round.answers];
    answers[round.index] = selection;
    updateRound({ ...round, answers, checked: true });
    setError("");
  };

  const nextQuestion = () => {
    const next = { ...round, index: round.index + 1, checked: false };
    updateRound(next);
    setSelection(next.answers[next.index] ?? null);
  };

  return (
    <section
      className={`glass ${styles.card}`}
      aria-labelledby="insurequiz-question-title"
    >
      <div className={styles.progressHeader}>
        <span className="eyebrow">{question.topic.toUpperCase()}</span>
        <span>
          Frage {round.index + 1} von {roundLength}
        </span>
      </div>
      <div className={styles.progressTrack}>
        <span
          style={{ width: `${((round.index + 1) / roundLength) * 100}%` }}
        />
      </div>
      <h2 id="insurequiz-question-title">{question.prompt}</h2>
      <form onSubmit={checkAnswer} noValidate>
        <fieldset disabled={round.checked} className={styles.options}>
          <legend>Wähle eine Antwort</legend>
          {question.choices.map((choice, index) => (
            <label
              key={choice}
              className={`${styles.option} ${selection === index ? styles.selected : ""} ${round.checked && index === question.correct ? styles.rightOption : ""} ${round.checked && selection === index && !isCorrect ? styles.wrongOption : ""}`}
            >
              <input
                type="radio"
                name="quiz-answer"
                value={index}
                checked={selection === index}
                onChange={() => {
                  setSelection(index);
                  setError("");
                }}
              />
              <span>{choice}</span>
            </label>
          ))}
        </fieldset>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        {round.checked ? (
          <div className={styles.feedback} role="status">
            <strong className={isCorrect ? styles.correct : styles.incorrect}>
              {isCorrect ? "Richtig!" : "Noch nicht ganz."}
            </strong>
            <p>{question.explanation}</p>
            <button type="button" className="primary" onClick={nextQuestion}>
              {round.index === roundLength - 1
                ? "Ergebnis ansehen"
                : "Nächste Frage"}{" "}
              <ChevronRight size={17} aria-hidden="true" />
            </button>
          </div>
        ) : (
          <button type="submit" className="primary">
            Antwort prüfen <ChevronRight size={17} aria-hidden="true" />
          </button>
        )}
      </form>
      <p className={styles.sources}>
        Grundlagen:{" "}
        <a
          href="https://www.verbraucherzentrale.de/wissen/geld-versicherungen/weitere-versicherungen/private-haftpflichtversicherung-ein-absolutes-muss-fuer-alle-13891"
          target="_blank"
          rel="noopener noreferrer"
        >
          Verbraucherzentrale Haftpflicht
        </a>{" "}
        ·{" "}
        <a
          href="https://www.verbraucherzentrale.de/wissen/geld-versicherungen/weitere-versicherungen/wohngebaeudeversicherung-fuer-hausbesitzerinnen-ein-absolutes-muss-40830"
          target="_blank"
          rel="noopener noreferrer"
        >
          Wohngebäude
        </a>{" "}
        ·{" "}
        <a
          href="https://www.verbraucherzentrale.de/wissen/geld-versicherungen/weitere-versicherungen/rechtsschutzversicherung-ueberfluessig-oder-sinnvoll-32194"
          target="_blank"
          rel="noopener noreferrer"
        >
          Rechtsschutz
        </a>
      </p>
    </section>
  );
}
