export const TRAINING_MAX_BYTES = 10 * 1024 * 1024;

export type TrainingDocument = {
  id: string;
  owner_id: string;
  title: string;
  description: string;
  file_size: number;
  created_at: string;
};

export function validateTrainingFile(file: File): string | null {
  if (file.size === 0 || file.size > TRAINING_MAX_BYTES)
    return "Die PDF muss zwischen 1 Byte und 10 MB groß sein.";
  if (
    file.type !== "application/pdf" ||
    !file.name.toLowerCase().endsWith(".pdf")
  )
    return "Bitte eine PDF-Datei auswählen.";
  return null;
}
