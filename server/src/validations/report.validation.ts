import z from "zod";
import { rangeOrdered } from "../utils/date.range.util.js";
import { dayOrInstant, id } from "./transaction.validation.js";

export class ReportValidation {
  static RANGE = z
    .object({
      from: dayOrInstant.optional(),
      to: dayOrInstant.optional(),
    })
    .strict()
    .refine((query) => rangeOrdered(query.from, query.to), {
      message: "from must not be after to",
      path: ["from"],
    });

  static TREND = z
    .object({ months: z.coerce.number().int().min(1).max(24).default(6) })
    .strict();

  static FLOW = z
    .object({
      from: dayOrInstant.optional(),
      to: dayOrInstant.optional(),
      account_id: id.optional(),
    })
    .strict()
    .refine((query) => rangeOrdered(query.from, query.to), {
      message: "from must not be after to",
      path: ["from"],
    });
}

export type RangeQuery = z.infer<typeof ReportValidation.RANGE>;
export type TrendQuery = z.infer<typeof ReportValidation.TREND>;
export type FlowQuery = z.infer<typeof ReportValidation.FLOW>;
