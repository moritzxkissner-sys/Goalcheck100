import {
  privateCustomerQuestions,
  privateCustomerLearningContent,
} from "./academy-private-customers";

export const academyCatalogVersion = "2026-11-03-v1";
export function getAcademyModuleVersion(moduleId: string) {
  return moduleId === "specialist-privatkunden-grundlagen"
    ? "2026-11-06-privatkunden-v1"
    : academyCatalogVersion;
}
export type AcademyQuestion = {
  id: string;
  topic: string;
  prompt: string;
  choices: string[];
  correctAnswers: number[];
  explanation: string;
  source: { title: string; url?: string };
};
export type AcademyModule = {
  id: string;
  title: string;
  description: string;
  content: string[];
  questionIds: string[];
  requiresDocuments: boolean;
};
export type AcademyTrack = {
  id: string;
  group: "specialist" | "salespower";
  title: string;
  description: string;
  accent: string;
  modules: AcademyModule[];
};
export type AcademyAnswers = (number[] | null)[];
export type AcademyScore = {
  correct: number;
  total: number;
  answered: number;
  percentage: number;
};
export type AcademyProgressInput = {
  catalog_version?: string;
  module_id: string;
  attempt_id: string;
  answers: AcademyAnswers;
  position: number;
  completed: boolean;
};
export type AcademyProgress = AcademyProgressInput & {
  catalog_version: string;
  updated_at: string;
  score: AcademyScore;
};
export type AcademyAttempt = {
  module_id: string;
  attempt_id: string;
  answers: AcademyAnswers;
  catalog_version: string;
  created_at: string;
  score: AcademyScore;
};
export const academyQuestions: AcademyQuestion[] = [
  {
    source: { title: "GoalTrack InsureQuiz · vorhandene Grundlagen" },
    id: "hausrat",
    topic: "Sachversicherung",
    prompt:
      "Ein Wasserschaden beschädigt das frei stehende Sofa. Welche Versicherung ist für den Hausrat grundsätzlich zuständig?",
    choices: [
      "Hausratversicherung",
      "Wohngebäudeversicherung",
      "Privathaftpflichtversicherung",
    ],
    correctAnswers: [0],
    explanation:
      "Bewegliche Einrichtungsgegenstände gehören zum Hausrat. Ob der konkrete Leitungswasserschaden versichert ist, hängt vom Vertrag ab.",
  },
  {
    source: { title: "GoalTrack InsureQuiz · vorhandene Grundlagen" },
    id: "gebaeude",
    topic: "Sachversicherung",
    prompt:
      "Ein Sturm beschädigt das Dach eines Hauses. Was ist grundsätzlich der passende Versicherungsschutz?",
    choices: [
      "Hausratversicherung",
      "Wohngebäudeversicherung",
      "Rechtsschutzversicherung",
    ],
    correctAnswers: [1],
    explanation:
      "Das Dach ist Teil des Gebäudes. Schäden daran fallen grundsätzlich in den Bereich der Wohngebäudeversicherung; maßgeblich sind die Bedingungen.",
  },
  {
    source: { title: "GoalTrack InsureQuiz · vorhandene Grundlagen" },
    id: "haftpflicht",
    topic: "Haftpflicht",
    prompt:
      "Welche Aufgabe hat eine Privathaftpflichtversicherung bei einem Schadenersatzanspruch?",
    choices: [
      "Sie zahlt jede Forderung sofort",
      "Sie prüft den Anspruch und übernimmt berechtigte Forderungen",
      "Sie ersetzt Schäden am eigenen Hausrat",
    ],
    correctAnswers: [1],
    explanation:
      "Der Versicherer prüft zunächst, ob der Anspruch berechtigt ist. Berechtigte Ansprüche reguliert er im Rahmen des Vertrags.",
  },
  {
    source: { title: "GoalTrack InsureQuiz · vorhandene Grundlagen" },
    id: "selbstbeteiligung",
    topic: "Vertragsbegriffe",
    prompt: "Was bedeutet eine vereinbarte Selbstbeteiligung?",
    choices: [
      "Der Kunde trägt einen vereinbarten Anteil des Schadens selbst",
      "Der Versicherer zahlt immer doppelt",
      "Der Beitrag entfällt im Schadenfall",
    ],
    correctAnswers: [0],
    explanation:
      "Die Selbstbeteiligung ist der Eigenanteil, den die versicherte Person im Schadenfall gemäß Vertrag trägt.",
  },
  {
    source: { title: "GoalTrack InsureQuiz · vorhandene Grundlagen" },
    id: "rechtsschutz",
    topic: "Rechtsschutz",
    prompt: "Wobei kann eine Rechtsschutzversicherung je nach Vertrag helfen?",
    choices: [
      "Bei Kosten eines versicherten Rechtsstreits",
      "Bei der Reparatur eines Sturmschadens",
      "Bei jeder beliebigen Geldstrafe",
    ],
    correctAnswers: [0],
    explanation:
      "Rechtsschutz kann etwa Anwalts- und Gerichtskosten für versicherte Streitigkeiten tragen. Umfang, Ausschlüsse und Wartezeiten stehen im Vertrag.",
  },
  {
    source: { title: "GoalTrack InsureQuiz · vorhandene Grundlagen" },
    id: "bedingungen",
    topic: "Beratung",
    prompt:
      "Wo prüfst du, ob ein konkreter Schaden und seine Ursache versichert sind?",
    choices: [
      "Nur am Produktnamen",
      "In den vereinbarten Versicherungsbedingungen",
      "Allein an der Beitragshöhe",
    ],
    correctAnswers: [1],
    explanation:
      "Versicherte Gefahren, Ausschlüsse, Grenzen und Selbstbeteiligungen ergeben sich aus den vereinbarten Bedingungen.",
  },
  {
    source: { title: "GoalTrack InsureQuiz · vorhandene Grundlagen" },
    id: "elementar",
    topic: "Sachversicherung",
    prompt:
      "Welcher Schaden erfordert in der Regel einen zusätzlichen Elementarschutz?",
    choices: [
      "Überschwemmung",
      "Einbruchdiebstahl",
      "Ein zerbrochenes Trinkglas",
    ],
    correctAnswers: [0],
    explanation:
      "Überschwemmung zählt zu den Elementargefahren. Ob sie versichert ist, muss im konkreten Vertrag geprüft werden.",
  },
  {
    source: { title: "GoalTrack InsureQuiz · vorhandene Grundlagen" },
    id: "versicherungssumme",
    topic: "Vertragsbegriffe",
    prompt: "Warum ist neben dem Beitrag auch die Versicherungssumme wichtig?",
    choices: [
      "Sie kann die maximale Entschädigung begrenzen",
      "Sie ersetzt immer die Selbstbeteiligung",
      "Sie legt den Schadenzeitpunkt fest",
    ],
    correctAnswers: [0],
    explanation:
      "Ein Vertrag kann die Leistung pro Versicherungsfall durch eine vereinbarte Versicherungssumme oder Entschädigungsgrenze begrenzen.",
  },
  {
    id: "bedingungen-mehrfach",
    topic: "Beratung",
    prompt:
      "Welche Angaben prüfst du in den vereinbarten Bedingungen? Wähle alle passenden Antworten.",
    choices: [
      "Versicherte Gefahren und Ausschlüsse",
      "Grenzen und Selbstbeteiligungen",
      "Nur den Produktnamen",
    ],
    correctAnswers: [0, 1],
    explanation:
      "Versicherte Gefahren, Ausschlüsse, Grenzen und Selbstbeteiligungen ergeben sich aus den vereinbarten Bedingungen.",
    source: {
      title: "GoalTrack InsureQuiz · Erklärung zu Versicherungsbedingungen",
    },
  },
  ...privateCustomerQuestions,
];
function unavailable(
  id: string,
  group: AcademyTrack["group"],
  title: string,
): AcademyTrack {
  return {
    id,
    group,
    title,
    description: "Die fachlichen Schulungsunterlagen werden noch ergänzt.",
    accent: group === "specialist" ? "violet" : "blue",
    modules: [
      {
        id: id + "-grundlagen",
        title: "Grundlagen",
        description: "Unterlagen ausstehend",
        content: [],
        questionIds: [],
        requiresDocuments: true,
      },
    ],
  };
}
function available(
  id: string,
  title: string,
  questionIds: string[],
): AcademyTrack {
  return {
    id,
    group: "salespower",
    title,
    description: "Allgemeine Grundlagen aus dem vorhandenen InsureQuiz.",
    accent: "blue",
    modules: [
      {
        id: id + "-grundlagen",
        title: title + " · Grundlagen",
        description: "Grundlagen lesen und mit Übungsfragen festigen.",
        content: questionIds
          .filter((id) => id !== "bedingungen-mehrfach")
          .map(
            (id) =>
              academyQuestions.find((question) => question.id === id)!
                .explanation,
          ),
        questionIds,
        requiresDocuments: false,
      },
    ],
  };
}
export const academyTracks: AcademyTrack[] = [
  {
    id: "specialist-privatkunden",
    group: "specialist",
    title: "Recht und Absicherung Privatkunden",
    description:
      "Wissen aus den bereitgestellten Schulungsunterlagen mit Multiple-Choice-Fragen festigen.",
    accent: "violet",
    modules: [
      {
        id: "specialist-privatkunden-grundlagen",
        title: "Grundlagen",
        description:
          "Recht und Absicherung Privatkunden · Quellen lesen und Wissen prüfen.",
        content: privateCustomerLearningContent,
        questionIds: privateCustomerQuestions.map((question) => question.id),
        requiresDocuments: false,
      },
    ],
  },
  unavailable(
    "specialist-recht-gewerbe",
    "specialist",
    "Recht und Absicherung Gewerbe",
  ),
  unavailable("specialist-gesundheit", "specialist", "Gesundheit"),
  unavailable(
    "specialist-lebensversicherung",
    "specialist",
    "Lebensversicherung",
  ),
  unavailable(
    "salespower-gkv",
    "salespower",
    "Gesetzliche Krankenversicherung",
  ),
  unavailable("salespower-grv", "salespower", "Gesetzliche Rentenversicherung"),
  available("salespower-rechtsschutz", "Rechtsschutzversicherung", [
    "rechtsschutz",
    "bedingungen",
    "bedingungen-mehrfach",
  ]),
  available("salespower-hausrat", "Hausratversicherung", [
    "hausrat",
    "selbstbeteiligung",
    "versicherungssumme",
  ]),
  available("salespower-haftpflicht", "Haftpflichtversicherung", [
    "haftpflicht",
    "bedingungen-mehrfach",
  ]),
  available("salespower-wohngebaeude", "Wohngebäudeversicherung", [
    "gebaeude",
    "elementar",
  ]),
  unavailable("salespower-recht-und-heim", "salespower", "Recht und Heim"),
];
export function getAcademyModule(id: string) {
  return academyTracks
    .flatMap((track) => track.modules)
    .find((lesson) => lesson.id === id);
}
export function scoreAcademyAnswers(
  moduleId: string,
  answers: AcademyAnswers,
): AcademyScore {
  const ids = getAcademyModule(moduleId)?.questionIds ?? [];
  let correct = 0;
  let answered = 0;
  ids.forEach((id, index) => {
    const expected = academyQuestions.find(
      (question) => question.id === id,
    )!.correctAnswers;
    const answer = answers[index];
    if (!answer?.length) return;
    answered++;
    if (
      answer.length === expected.length &&
      new Set(answer).size === answer.length &&
      expected.every((value) => answer.includes(value))
    )
      correct++;
  });
  return {
    correct,
    total: ids.length,
    answered,
    percentage: ids.length ? Math.round((correct / ids.length) * 100) : 0,
  };
}
export function parseAcademyProgress(
  value: unknown,
): AcademyProgressInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (
    typeof input.module_id !== "string" ||
    typeof input.attempt_id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      input.attempt_id,
    )
  )
    return null;
  const lesson = getAcademyModule(input.module_id);
  const version = getAcademyModuleVersion(input.module_id);
  if (
    (input.catalog_version !== undefined &&
      input.catalog_version !== version) ||
    (input.module_id === "specialist-privatkunden-grundlagen" &&
      input.catalog_version !== version)
  )
    return null;
  if (
    !lesson ||
    lesson.requiresDocuments ||
    !lesson.questionIds.length ||
    !Array.isArray(input.answers) ||
    input.answers.length !== lesson.questionIds.length ||
    typeof input.completed !== "boolean" ||
    !Number.isInteger(input.position)
  )
    return null;
  const position = input.position as number;
  if (
    position < 0 ||
    position > lesson.questionIds.length ||
    (!input.completed && position === lesson.questionIds.length)
  )
    return null;
  const answers = input.answers as AcademyAnswers;
  if (
    !answers.every((answer, index) => {
      if (answer === null) return !input.completed && index >= position;
      const question = academyQuestions.find(
        (q) => q.id === lesson.questionIds[index],
      )!;
      return (
        Array.isArray(answer) &&
        answer.length > 0 &&
        answer.length <= question.choices.length &&
        new Set(answer).size === answer.length &&
        answer.every(
          (value) =>
            Number.isInteger(value) &&
            value >= 0 &&
            value < question.choices.length,
        ) &&
        (question.correctAnswers.length > 1 || answer.length === 1)
      );
    })
  )
    return null;
  if (input.completed && position !== lesson.questionIds.length) return null;
  return {
    catalog_version: version,
    module_id: input.module_id,
    attempt_id: input.attempt_id,
    answers,
    position,
    completed: input.completed,
  };
}
export function summarizeAcademyProgress(
  progress: AcademyProgress[],
  trackId?: string,
) {
  const modules = academyTracks
    .filter((track) => !trackId || track.id === trackId)
    .flatMap((track) => track.modules);
  const completed = modules.filter(
    (lesson) =>
      !lesson.requiresDocuments &&
      progress.some(
        (row) =>
          row.module_id === lesson.id &&
          row.catalog_version === getAcademyModuleVersion(row.module_id) &&
          row.completed &&
          !!parseAcademyProgress(row),
      ),
  ).length;
  const started = modules.filter((lesson) =>
    progress.some(
      (row) =>
        row.module_id === lesson.id &&
        row.catalog_version === getAcademyModuleVersion(row.module_id),
    ),
  ).length;
  return {
    completed,
    total: modules.length,
    percentage: modules.length
      ? Math.round((completed / modules.length) * 100)
      : 0,
    started,
  };
}
