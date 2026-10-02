import { z } from "zod";

/**
 * Reporting period and grouping.
 *
 * `from`/`to` are instants. A bare date is read as midnight UTC of that day,
 * which is what the reporting period has always meant: a report "to
 * 2025-12-31" ends at the *start* of the 31st and excludes activity during
 * that day. Both bounds are inclusive, and a row is counted only when it lies
 * **entirely** inside them — a reservation or job straddling either edge
 * belongs to no period. That is deliberate and matches the figures the
 * consuntivo has been reconciled against; widening it would silently restate
 * past reports.
 */
const instant = z
  .union([z.iso.datetime({ offset: true }), z.iso.datetime(), z.iso.date()])
  .transform((value) =>
    // A bare date carries no zone; anchor it to UTC rather than the server's.
    value.length === 10 ? new Date(`${value}T00:00:00.000Z`) : new Date(value),
  );

export const reportQuerySchema = z
  .object({
    from: instant,
    to: instant,
    /**
     * Organizations are reached through the project, never through
     * `jobs.organization_id`: reservations carry no organization of their own,
     * and the job column is a snapshot taken when the job was reported, so the
     * two disagree for any project that has since moved. The project's current
     * organization is the attribution the platform considers current.
     */
    group_by: z.enum(["project", "organization"]).default("project"),
  })
  .refine((q) => q.from < q.to, {
    message: "`from` must be earlier than `to`",
    path: ["from"],
  });

export type ReportQueryDto = z.infer<typeof reportQuerySchema>;
