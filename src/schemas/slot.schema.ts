import { z } from "zod";
import { recurrenceSchema } from "utils/recurrence.ts";

export const createSlotSchema = z.object({
  organization_id: z.number().int(),
  day: z.iso.date(),
  start: z.iso.datetime(),
  end: z.iso.datetime(),
});

export const updateSlotSchema = createSlotSchema; //.partial();

export type CreateSlotDto = z.infer<typeof createSlotSchema>;
export type UpdateSlotDto = z.infer<typeof updateSlotSchema>;

/**
 * A recurring series of slots. `dry_run` returns what would be created and
 * which occurrences conflict, writing nothing; without it, conflicts refuse the
 * whole series unless `skip_conflicts` says to create the rest.
 */
export const createSlotSeriesSchema = z.object({
  organization_id: z.number().int(),
  recurrence: recurrenceSchema,
  dry_run: z.boolean().default(false),
  skip_conflicts: z.boolean().default(false),
});

export type CreateSlotSeriesDto = z.infer<typeof createSlotSeriesSchema>;
