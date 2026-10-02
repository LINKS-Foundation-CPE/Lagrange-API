import { QueryTypes } from "sequelize";
import { Job } from "../models/index.ts";

/**
 * Reporting aggregates, in SQL.
 *
 * These queries *are* the metric definitions — the numbers on an invoice come
 * from here — so they are written out rather than assembled from a query
 * builder, and each carries the rule it implements. Grouping is by project or
 * by organization; the organization is always reached through the project.
 *
 * Durations are summed in seconds (`EXTRACT(EPOCH …)`) and converted to hours
 * once, in the service. Rows whose end precedes their start are discarded
 * rather than subtracted, and a NULL bound drops out of the range comparison
 * on its own.
 */

export interface ReportRow {
  project_id: number | null;
  project_name: string | null;
  free_queue: boolean | null;
  organization_id: number | null;
  organization_name: string | null;
  count: string;
  total_seconds: string | null;
}

export interface UtilizationRow extends ReportRow {
  usage_seconds: string | null;
  reserved_seconds: string | null;
}

export interface ReportPeriod {
  from: Date;
  to: Date;
  organizationId?: number;
}

const sequelize = () => {
  const conn = Job.sequelize;
  if (!conn) throw new Error("models are not initialised");
  return conn;
};

/** Columns and GROUP BY differ only in whether the project survives. */
const grouping = (groupBy: "project" | "organization") =>
  groupBy === "project"
    ? {
        select: `p.id AS project_id, p.name AS project_name, p.free_queue,
                 p.organization_id, o.name AS organization_name`,
        by: `p.id, p.name, p.free_queue, p.organization_id, o.name`,
      }
    : {
        select: `NULL::integer AS project_id, NULL::text AS project_name,
                 NULL::boolean AS free_queue,
                 p.organization_id, o.name AS organization_name`,
        by: `p.organization_id, o.name`,
      };

/** Restricts a report to one organization, for a caller who may see only theirs. */
const orgScope = (organizationId?: number) =>
  organizationId === undefined ? "" : "AND p.organization_id = :organizationId";

/**
 * Reservations booked in the period, by project or organization.
 *
 * Reservations carry no organization of their own, so attribution runs through
 * the project. A reservation counts only if it lies entirely within the period.
 */
export const reservations = async (
  { from, to, organizationId }: ReportPeriod,
  groupBy: "project" | "organization",
): Promise<ReportRow[]> => {
  const g = grouping(groupBy);
  return sequelize().query<ReportRow>(
    `SELECT ${g.select},
            COUNT(*)::text AS count,
            SUM(EXTRACT(EPOCH FROM (r."end" - r."start")))::text AS total_seconds
       FROM reservations r
       JOIN projects p ON p.id = r.project_id
       LEFT JOIN organizations o ON o.id = p.organization_id
      WHERE r."start" >= :from
        AND r."end"   <= :to
        AND r."end"   >= r."start"
        ${orgScope(organizationId)}
      GROUP BY ${g.by}
      ORDER BY ${g.by}`,
    {
      replacements: { from, to, organizationId },
      type: QueryTypes.SELECT,
    },
  );
};

/**
 * Queue jobs executed in the period, by project or organization.
 *
 * Jobs that ran inside a reservation are **excluded**: that time is already
 * billed as reserved hours, and counting both would bill it twice. The count is
 * a count of jobs — there is no shots column to weight it by.
 */
export const jobs = async (
  { from, to, organizationId }: ReportPeriod,
  groupBy: "project" | "organization",
): Promise<ReportRow[]> => {
  const g = grouping(groupBy);
  return sequelize().query<ReportRow>(
    `SELECT ${g.select},
            COUNT(*)::text AS count,
            SUM(EXTRACT(EPOCH FROM (j.execution_end - j.execution_start)))::text AS total_seconds
       FROM jobs j
       JOIN projects p ON p.id = j.project_id
       LEFT JOIN organizations o ON o.id = p.organization_id
      WHERE j.execution_start >= :from
        AND j.execution_end   <= :to
        AND j.execution_end   >= j.execution_start
        AND COALESCE(j."usedReservation", false) = false
        ${orgScope(organizationId)}
      GROUP BY ${g.by}
      ORDER BY ${g.by}`,
    {
      replacements: { from, to, organizationId },
      type: QueryTypes.SELECT,
    },
  );
};

/**
 * Slots allocated in the period, by organization.
 *
 * Slots belong to an organization directly, so there is no project dimension
 * and no grouping choice.
 */
export const slots = async ({
  from,
  to,
  organizationId,
}: ReportPeriod): Promise<ReportRow[]> =>
  sequelize().query<ReportRow>(
    `SELECT NULL::integer AS project_id, NULL::text AS project_name,
            NULL::boolean AS free_queue,
            s.organization_id, o.name AS organization_name,
            COUNT(*)::text AS count,
            SUM(EXTRACT(EPOCH FROM (s."end" - s."start")))::text AS total_seconds
       FROM slots s
       LEFT JOIN organizations o ON o.id = s.organization_id
      WHERE s."start" >= :from
        AND s."end"   <= :to
        AND s."end"   >= s."start"
        ${organizationId === undefined ? "" : "AND s.organization_id = :organizationId"}
      GROUP BY s.organization_id, o.name
      ORDER BY s.organization_id`,
    {
      replacements: { from, to, organizationId },
      type: QueryTypes.SELECT,
    },
  );

/**
 * How much of the reserved time was actually used.
 *
 * The counterpart to `jobs`: the jobs that ran *inside* a reservation, matched
 * to their block by project and containment, against the hours that block
 * reserved. `count` is those jobs; `total_seconds` is their execution time, so
 * the column means the same thing as in the other reports.
 *
 * The join is per block, so a project's blocks are summed rather than matched
 * as one lump — two reservations on the same day are two denominators. A job
 * that straddles a block boundary belongs to neither, exactly as a job
 * straddling the period boundary belongs to no period.
 */
export const utilization = async (
  { from, to, organizationId }: ReportPeriod,
  groupBy: "project" | "organization",
): Promise<UtilizationRow[]> => {
  const g = grouping(groupBy);
  return sequelize().query<UtilizationRow>(
    `WITH blocks AS (
       SELECT r.id, r.project_id,
              EXTRACT(EPOCH FROM (r."end" - r."start")) AS reserved_seconds,
              r."start", r."end"
         FROM reservations r
        WHERE r."start" >= :from
          AND r."end"   <= :to
          AND r."end"   >= r."start"
     ),
     used AS (
       SELECT b.id, b.project_id, b.reserved_seconds,
              COUNT(j.id) AS job_count,
              COALESCE(
                SUM(EXTRACT(EPOCH FROM (j.execution_end - j.execution_start))), 0
              ) AS usage_seconds
         FROM blocks b
         LEFT JOIN jobs j
                ON j.project_id       = b.project_id
               AND COALESCE(j."usedReservation", false) = true
               AND j.execution_start >= b."start"
               AND j.execution_end   <= b."end"
               AND j.execution_end   >= j.execution_start
        GROUP BY b.id, b.project_id, b.reserved_seconds
     )
     SELECT ${g.select},
            SUM(used.job_count)::text        AS count,
            SUM(used.usage_seconds)::text    AS total_seconds,
            SUM(used.usage_seconds)::text    AS usage_seconds,
            SUM(used.reserved_seconds)::text AS reserved_seconds
       FROM used
       JOIN projects p ON p.id = used.project_id
       LEFT JOIN organizations o ON o.id = p.organization_id
      WHERE TRUE ${orgScope(organizationId)}
      GROUP BY ${g.by}
      ORDER BY ${g.by}`,
    {
      replacements: { from, to, organizationId },
      type: QueryTypes.SELECT,
    },
  );
};
