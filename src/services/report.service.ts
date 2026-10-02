import * as repo from "repositories/report.repository.ts";
import CustomError from "config/CustomError.ts";
import { AuthUser } from "../types/auth.ts";
import { ReportQueryDto } from "schemas/report.schema.ts";

/**
 * Billing reports.
 *
 * Everything here is derived from the platform's own record of what ran —
 * `execution_start → execution_end` per job and the reservation blocks. The
 * device vendor's metered figure is deliberately not an input: it carries no
 * per-project breakdown and does not reconcile with these numbers.
 *
 * These reports measure **time on the machine**, which is not always the same
 * as the amount charged: under `ACCEPT_REPORTED_BILLING` a job may be billed a
 * reported `billable` quantity instead of its execution window. That is the
 * ledger's business — `budget_events` is the record of what was charged, and
 * these are the record of what ran.
 */

/** Seconds are the unit in SQL; hours are the unit on an invoice. */
const hours = (seconds: string | null) =>
  seconds === null ? 0 : Number(seconds) / 3600;

export interface ReportRow {
  id: number;
  project_id: number | null;
  project_name: string | null;
  free_queue: boolean | null;
  organization_id: number | null;
  organization_name: string | null;
  count: number;
  total_seconds: number;
  total_hours: number;
}

export interface UtilizationReportRow extends ReportRow {
  usage_hours: number;
  reserved_hours: number;
  /** Fraction of the reserved time actually spent executing, or null if nothing was reserved. */
  utilization: number | null;
}

/**
 * Which organization the caller may see.
 *
 * Platform admins see everything. An organization manager or auditor sees
 * their own organization and no other — the point of putting these reports in
 * the API is that an organization can pull its own figures without anyone
 * exporting the database.
 */
const scopeFor = (user: AuthUser): number | undefined => {
  if (user.roles.includes("admin") || user.roles.includes("readOnlyAdmin")) {
    return undefined;
  }
  const organizationId = user.organization?.id;
  if (!organizationId) {
    throw new CustomError({
      statusCode: 403,
      message: "no organization to report on",
    });
  }
  return organizationId;
};

/**
 * react-admin needs an `id` per row, and these rows are aggregates with no
 * identity of their own; the grouping key is the only stable choice.
 */
const shape = (row: repo.ReportRow): ReportRow => ({
  id: row.project_id ?? row.organization_id ?? 0,
  project_id: row.project_id,
  project_name: row.project_name,
  free_queue: row.free_queue,
  organization_id: row.organization_id,
  organization_name: row.organization_name,
  count: Number(row.count ?? 0),
  total_seconds: row.total_seconds === null ? 0 : Number(row.total_seconds),
  total_hours: hours(row.total_seconds),
});

const period = (user: AuthUser, query: ReportQueryDto) => ({
  from: query.from,
  to: query.to,
  organizationId: scopeFor(user),
});

export const reservations = async (user: AuthUser, query: ReportQueryDto) =>
  (await repo.reservations(period(user, query), query.group_by)).map(shape);

export const jobs = async (user: AuthUser, query: ReportQueryDto) =>
  (await repo.jobs(period(user, query), query.group_by)).map(shape);

export const slots = async (user: AuthUser, query: ReportQueryDto) =>
  (await repo.slots(period(user, query))).map(shape);

export const utilization = async (
  user: AuthUser,
  query: ReportQueryDto,
): Promise<UtilizationReportRow[]> =>
  (await repo.utilization(period(user, query), query.group_by)).map((row) => {
    const reserved = hours(row.reserved_seconds);
    return {
      ...shape(row),
      usage_hours: hours(row.usage_seconds),
      reserved_hours: reserved,
      // A block of zero length would otherwise divide by zero; report it as
      // "no ratio" rather than as infinite or fully used.
      utilization: reserved > 0 ? hours(row.usage_seconds) / reserved : null,
    };
  });

/**
 * Every report for one period, which is what producing a consuntivo actually
 * needs — one round trip instead of four, and the sections cannot drift onto
 * different periods.
 */
export const summary = async (user: AuthUser, query: ReportQueryDto) => {
  const [
    reservationsByProject,
    reservationsByOrganization,
    jobsByProject,
    jobsByOrganization,
    slotsByOrganization,
    utilizationByProject,
  ] = await Promise.all([
    reservations(user, { ...query, group_by: "project" }),
    reservations(user, { ...query, group_by: "organization" }),
    jobs(user, { ...query, group_by: "project" }),
    jobs(user, { ...query, group_by: "organization" }),
    slots(user, query),
    utilization(user, { ...query, group_by: "project" }),
  ]);

  return {
    period: { from: query.from, to: query.to },
    reservations: {
      by_project: reservationsByProject,
      by_organization: reservationsByOrganization,
    },
    jobs: { by_project: jobsByProject, by_organization: jobsByOrganization },
    slots: { by_organization: slotsByOrganization },
    utilization: { by_project: utilizationByProject },
  };
};
