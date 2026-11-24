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

export interface ReservationRow extends ReportRow {
  past_count: string;
  past_seconds: string | null;
  future_count: string;
  future_seconds: string | null;
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
 *
 * Each row is also split at `cutoff` by start time: a reservation starting
 * before it is *past* (already used, or too close to be given back), one
 * starting at or after it is *future* (booked, not yet used). Past and future
 * add up to the totals.
 */
export const reservations = async (
  { from, to, organizationId }: ReportPeriod,
  groupBy: "project" | "organization",
  cutoff: Date,
): Promise<ReservationRow[]> => {
  const g = grouping(groupBy);
  const seconds = `EXTRACT(EPOCH FROM (r."end" - r."start"))`;
  return sequelize().query<ReservationRow>(
    `SELECT ${g.select},
            COUNT(*)::text AS count,
            SUM(${seconds})::text AS total_seconds,
            COUNT(*) FILTER (WHERE r."start" < :cutoff)::text AS past_count,
            SUM(${seconds}) FILTER (WHERE r."start" < :cutoff)::text AS past_seconds,
            COUNT(*) FILTER (WHERE r."start" >= :cutoff)::text AS future_count,
            SUM(${seconds}) FILTER (WHERE r."start" >= :cutoff)::text AS future_seconds
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
      replacements: { from, to, organizationId, cutoff },
      type: QueryTypes.SELECT,
    },
  );
};

/**
 * Seconds of a job's execution inside its own project's reservations.
 *
 * Reservations cannot overlap each other, so summing the overlaps is exact.
 * Intervals are half-open: a job ending as a reservation starts overlaps it by
 * zero. This is the same rule billing applies (services/reservationCoverage).
 */
const INSIDE_SECONDS = `COALESCE((
    SELECT SUM(EXTRACT(EPOCH FROM (
             LEAST(j.execution_end, r."end") - GREATEST(j.execution_start, r."start"))))
      FROM reservations r
     WHERE r.project_id = j.project_id
       AND r."start" < j.execution_end
       AND r."end"   > j.execution_start
  ), 0)`;

/**
 * Queue time executed in the period, by project or organization.
 *
 * Only the part of each job's execution **outside** its project's
 * reservations: the part inside was paid with the reservation, and counting
 * it again would bill it twice. A job wholly inside a reservation contributes
 * nothing and is not counted; a job straddling a reservation edge contributes
 * its outside part. Decided by when the job executed, not by the
 * submission-time `usedReservation` flag, which is what billing does too.
 * `count` is the number of jobs with any queue time.
 */
export const jobs = async (
  { from, to, organizationId }: ReportPeriod,
  groupBy: "project" | "organization",
): Promise<ReportRow[]> => {
  const g = grouping(groupBy);
  return sequelize().query<ReportRow>(
    `WITH queue AS (
       SELECT j.project_id,
              EXTRACT(EPOCH FROM (j.execution_end - j.execution_start))
                - ${INSIDE_SECONDS} AS outside_seconds
         FROM jobs j
        WHERE j.execution_start >= :from
          AND j.execution_end   <= :to
          AND j.execution_end   >= j.execution_start
     )
     SELECT ${g.select},
            COUNT(*)::text AS count,
            SUM(q.outside_seconds)::text AS total_seconds
       FROM queue q
       JOIN projects p ON p.id = q.project_id
       LEFT JOIN organizations o ON o.id = p.organization_id
      WHERE q.outside_seconds > 0
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
 * The counterpart to `jobs`: for each reservation block in the period, the
 * execution of its project's jobs that falls inside the block, clipped to it,
 * against the hours the block reserved. A job straddling a block edge
 * contributes the part inside it, exactly as billing leaves that part
 * uncharged. `count` is the jobs that ran at least partly inside;
 * `total_seconds` is that inside time, so the column means the same thing as
 * in the other reports. Decided by when jobs executed, not by the
 * submission-time `usedReservation` flag.
 *
 * The join is per block, so a project's blocks are summed rather than matched
 * as one lump: two reservations on the same day are two denominators.
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
                SUM(EXTRACT(EPOCH FROM (
                  LEAST(j.execution_end, b."end") - GREATEST(j.execution_start, b."start")))), 0
              ) AS usage_seconds
         FROM blocks b
         LEFT JOIN jobs j
                ON j.project_id       = b.project_id
               AND j.execution_start < b."end"
               AND j.execution_end   > b."start"
               AND j.execution_end   > j.execution_start
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
