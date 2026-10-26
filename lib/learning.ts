export const learningTracks = [
  {
    id: "fachberater-recht",
    title: "Fachberater Rechtsschutz",
    group: "Fachberaterzertifizierungen",
  },
  {
    id: "fachberater-sach",
    title: "Fachberater Sachversicherungen",
    group: "Fachberaterzertifizierungen",
  },
  {
    id: "fachberater-gesundheit",
    title: "Fachberater Gesundheit",
    group: "Fachberaterzertifizierungen",
  },
  {
    id: "fachberater-vorsorge",
    title: "Fachberater Vorsorge",
    group: "Fachberaterzertifizierungen",
  },
  {
    id: "salespower-grundlagen",
    title: "SalesPower · Grundlagen",
    group: "SalesPower Ausbildung",
  },
  {
    id: "salespower-beratung",
    title: "SalesPower · Beratung",
    group: "SalesPower Ausbildung",
  },
  {
    id: "salespower-produkte",
    title: "SalesPower · Produkte",
    group: "SalesPower Ausbildung",
  },
  {
    id: "salespower-kundenkontakt",
    title: "SalesPower · Kundenkontakt",
    group: "SalesPower Ausbildung",
  },
  {
    id: "salespower-abschluss",
    title: "SalesPower · Abschluss",
    group: "SalesPower Ausbildung",
  },
  {
    id: "salespower-service",
    title: "SalesPower · Service",
    group: "SalesPower Ausbildung",
  },
  {
    id: "salespower-praxis",
    title: "SalesPower · Praxis",
    group: "SalesPower Ausbildung",
  },
] as const;

export type LearningProgress = {
  track_id: string;
  completed_units: number;
  total_units: number;
  updated_at: string;
};

export function parseLearningProgress(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (
    typeof input.track_id !== "string" ||
    !learningTracks.some((track) => track.id === input.track_id)
  )
    return null;
  if (
    !Number.isInteger(input.completed_units) ||
    !Number.isInteger(input.total_units)
  )
    return null;
  const completed_units = input.completed_units as number;
  const total_units = input.total_units as number;
  if (
    total_units < 1 ||
    total_units > 100 ||
    completed_units < 0 ||
    completed_units > total_units
  )
    return null;
  return { track_id: input.track_id, completed_units, total_units };
}

export function learningStatus(completed: number, total: number) {
  if (completed === 0) return "Offen" as const;
  if (completed >= total) return "Abgeschlossen" as const;
  return "In Bearbeitung" as const;
}

