import { z } from "zod";
import { categories, transactionTypes } from "./metrics";
export const monthSchema = z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/);
const amount = z.coerce
  .number()
  .finite()
  .positive()
  .max(999999999)
  .refine(
    (n) => Math.abs(n * 100 - Math.round(n * 100)) < 0.0001,
    "Maximal zwei Nachkommastellen.",
  );
const date = z
  .string()
  .regex(/^20\d{2}-(0[1-9]|1[0-2])-\d{2}$/)
  .refine((s) => {
    const d = new Date(s + "T12:00:00Z");
    return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, "Ungültiges Datum.");
export const entrySchema = z.object({
  id: z.uuid(),
  amount,
  category: z.enum(categories),
  transaction_type: z.enum(transactionTypes),
  occurred_on: date,
  customer_name: z.string().trim().max(120).default(""),
});
export const cancellationSchema = z.object({
  id: z.uuid(),
  amount,
  occurred_on: date,
  reason: z.string().trim().max(120).default(""),
});
export const goalSchema = z.object({ month: monthSchema, target: amount });
