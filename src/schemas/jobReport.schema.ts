import { z } from "zod";
import { identitySchema } from "./identity.ts";

export const createJobReportSchema = z.object({
  project_name: z.string().nullish(),
  // gateway-reported identity; shape follows the frozen USERNAME_FORMAT
  username: identitySchema,
  jobid: z.string(),
  status: z.string().nullish(),
  execution_start: z
    .union([
      z.iso.datetime(), // valid ISO datetime
      z.literal(""), // empty string allowed
    ])
    .nullish(),
  execution_end: z
    .union([
      z.iso.datetime(), // valid ISO datetime
      z.literal(""), // empty string allowed
    ])
    .nullish(),
  submitted_datetime: z.iso.datetime(),
  results: z.url().nullish(),
  submitted_circuit: z.url().nullish(),
  job_type: z.string().nullish(),
});

export const updateJobReportSchema = createJobReportSchema.partial().extend({
  /**
   * Amount to charge for this job, in the unit the deployment bills in —
   * honoured only when `ACCEPT_REPORTED_BILLING` is enabled, and only here on
   * the terminal report (the initial POST creates the row and bills nothing).
   * Integer, because it is subtracted from `projects.remaining_budget` as is.
   */
  billable: z.number().int().nonnegative().nullish(),
});

export type CreateJobReportDto = z.infer<typeof createJobReportSchema>;
export type UpdateJobReportDto = z.infer<typeof updateJobReportSchema>;
