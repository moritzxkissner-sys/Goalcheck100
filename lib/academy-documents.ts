import { getAcademyModule } from "@/lib/academy";
export const documentStatuses = [
  "uploaded",
  "review_pending",
  "approved",
  "archived",
] as const;
export type DocumentMetadata = {
  insurance_line: string;
  product: string;
  insurer: string;
  document_version: string;
  valid_from: string | null;
  module_id: string | null;
  processing_status: (typeof documentStatuses)[number];
};
export function parseDocumentMetadata(
  value: Record<string, unknown>,
): DocumentMetadata | null {
  const text = (key: string) =>
    typeof value[key] === "string" ? value[key].trim() : "";
  const insurance_line = text("insurance_line"),
    product = text("product"),
    insurer = text("insurer"),
    document_version = text("document_version");
  const valid_from = text("valid_from") || null,
    module_id = text("module_id") || null;
  const processing_status = text("processing_status") || "uploaded";
  if (
    [insurance_line, product, insurer].some((v) => !v || v.length > 120) ||
    !document_version ||
    document_version.length > 80 ||
    !documentStatuses.includes(
      processing_status as DocumentMetadata["processing_status"],
    ) ||
    (module_id && !getAcademyModule(module_id))
  )
    return null;
  if (
    valid_from &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(valid_from) ||
      Number.isNaN(Date.parse(valid_from)) ||
      new Date(valid_from).toISOString().slice(0, 10) !== valid_from)
  )
    return null;
  return {
    insurance_line,
    product,
    insurer,
    document_version,
    valid_from,
    module_id,
    processing_status:
      processing_status as DocumentMetadata["processing_status"],
  };
}
export const draftStatuses = [
  "draft",
  "review_pending",
  "approved",
  "rejected",
] as const;
export type QuestionDraft = {
  id: string;
  document_id: string;
  document_version: string;
  citation: string;
  prompt: string;
  choices: string[];
  correct_indices: number[];
  explanation: string;
  module_id: string;
  status: (typeof draftStatuses)[number];
};
export function parseQuestionDraft(
  value: unknown,
): Omit<QuestionDraft, "id"> | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  for (const [key, max] of [
    ["document_id", 36],
    ["document_version", 80],
    ["citation", 2000],
    ["prompt", 1000],
    ["explanation", 3000],
    ["module_id", 120],
  ] as const)
    if (typeof v[key] !== "string" || !v[key].trim() || v[key].length > max)
      return null;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      v.document_id as string,
    ) ||
    !getAcademyModule(v.module_id as string) ||
    !draftStatuses.includes(v.status as QuestionDraft["status"])
  )
    return null;
  if (
    !Array.isArray(v.choices) ||
    v.choices.length < 2 ||
    v.choices.length > 6 ||
    v.choices.some((c) => typeof c !== "string" || !c.trim() || c.length > 500)
  )
    return null;
  if (
    !Array.isArray(v.correct_indices) ||
    !v.correct_indices.length ||
    new Set(v.correct_indices).size !== v.correct_indices.length ||
    v.correct_indices.some(
      (i) =>
        !Number.isInteger(i) || i < 0 || i >= (v.choices as unknown[]).length,
    )
  )
    return null;
  return {
    document_id: v.document_id as string,
    document_version: (v.document_version as string).trim(),
    citation: (v.citation as string).trim(),
    prompt: (v.prompt as string).trim(),
    choices: v.choices.map((c) => c.trim()),
    correct_indices: v.correct_indices,
    explanation: (v.explanation as string).trim(),
    module_id: v.module_id as string,
    status: v.status as QuestionDraft["status"],
  };
}

