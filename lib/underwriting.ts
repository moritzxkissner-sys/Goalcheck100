import { z } from "zod";
export const underwritingStatuses = {
  open: "Offen",
  in_progress: "In Bearbeitung",
  question: "Rückfrage",
  completed: "Erledigt",
} as const;
export const attachmentSchema = z.object({
  path: z.string().max(250),
  name: z.string().trim().min(1).max(180),
  size: z
    .number()
    .int()
    .min(1)
    .max(10 * 1024 * 1024),
  type: z.enum(["application/pdf", "image/jpeg", "image/png"]),
});
export const underwritingSchema = z.object({
  id: z.uuid(),
  department: z.enum(["Rechtsschutz", "SHU"]),
  customer_name: z.string().trim().min(1).max(120),
  subject: z.string().trim().min(1).max(180),
  message: z.string().trim().min(1).max(1000),
  attachments: z.array(attachmentSchema).max(5).default([]),
});
export type UnderwritingInput = z.infer<typeof underwritingSchema>;
export type UnderwritingRequest = Omit<UnderwritingInput, "attachments"> & {
  user_id: string;
  creator_name: string;
  status: keyof typeof underwritingStatuses;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};
export type UnderwritingAttachment = z.infer<typeof attachmentSchema> & {
  id: string;
  request_id: string;
};
export type UnderwritingEvent = {
  id: string;
  request_id: string;
  user_id: string;
  author_name: string;
  note: string;
  created_at: string;
};
export function underwritingStats(
  rows: UnderwritingRequest[],
  now = Date.now(),
) {
  const completed = rows.filter(
    (r) =>
      r.status === "completed" &&
      r.completed_at &&
      Date.parse(r.completed_at) >= now - 30 * 86400000,
  );
  return {
    open: rows.filter((r) => r.status !== "completed").length,
    completed: completed.length,
    averageDays: completed.length
      ? completed.reduce(
          (s, r) =>
            s +
            Math.max(0, Date.parse(r.completed_at!) - Date.parse(r.created_at)),
          0,
        ) /
        completed.length /
        86400000
      : null,
  };
}
export function validateUnderwritingFile(
  file: Pick<File, "name" | "size" | "type">,
) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  const expected = {
    pdf: "application/pdf",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
  }[extension ?? ""];
  return !expected ||
    file.type !== expected ||
    file.size < 1 ||
    file.size > 10 * 1024 * 1024 ||
    file.name.length > 180
    ? "Bitte PDF, JPG oder PNG bis 10 MB pro Datei verwenden."
    : null;
}
