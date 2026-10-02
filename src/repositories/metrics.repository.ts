import { QueryTypes } from "sequelize";
import { Job, User } from "../models/index.ts";

/**
 * The aggregates behind the Prometheus endpoint.
 *
 * Every grouped query starts FROM the dimension rather than from the counted
 * table — organizations, projects, tags — so each member is represented: one
 * that has never run a job reports `0` instead of vanishing from the scrape,
 * which is what lets a panel show a flat line rather than a gap.
 *
 * Attribution runs **through the project**, the same rule the billing reports
 * use: `jobs.organization_id` is a snapshot taken when the job was reported and
 * disagrees with the project's current organization if the project ever moved
 * between them. Two views of "jobs per organization" that disagree would be
 * worse than either, so there is one rule.
 *
 * Counts are **strict**: a job or reservation belongs to exactly one project,
 * which belongs to exactly one organization, so it is counted once and a parent
 * organization does *not* absorb the counts of the organizations that reference
 * it. Summing the series gives the true total, not an inflated one. The one
 * exception is per-tag, where a project may carry several tags and the series
 * therefore overlap by construction.
 */

export interface OrganizationCount {
  organization_id: number;
  organization_name: string;
  count: string;
}

/**
 * One row of the job aggregate. `is_org_total` is 1 for an organization's own
 * total and 0 for one of its projects — `GROUPING()` rather than "project_id is
 * null", because an organization with no projects produces a project-level row
 * with a null project that must not be mistaken for its total.
 */
export interface JobUsageRow {
  is_org_total: number;
  organization_id: number;
  organization_name: string;
  project_id: number | null;
  project_name: string | null;
  count: string;
  usage_seconds: string;
}

export interface TagCount {
  tag_id: number;
  tag_name: string;
  count: string;
}

export interface DomainCount {
  domain: string;
  count: string;
}

const sequelize = () => {
  const conn = Job.sequelize;
  if (!conn) throw new Error("models are not initialised");
  return conn;
};

/**
 * Jobs and executed QPU time, per project and per organization, in one pass.
 *
 * Both levels come from one query because the expensive part is reading
 * `jobs`, and asking twice doubled it: measured against 800k rows, one query
 * per level cost ~560 ms each, and this costs ~105 ms for both. Two things buy
 * that. The aggregate over `jobs` runs before the join, so 800k rows are
 * grouped down to one row per project and only those meet `projects` — joining
 * first and grouping after made Postgres hash 800k rows against the project
 * table. And the elapsed time is summed as an interval and converted to
 * seconds once, rather than `EXTRACT`ing on every row.
 *
 * `GROUPING SETS` then produces both levels from the same 60-row intermediate.
 * The organization figures are identical to the per-organization query this
 * replaced, which is the point: attribution still runs job -> project ->
 * organization, so a parent absorbs nothing from the organizations that
 * reference it.
 *
 * Jobs that ran inside a reservation are **not** excluded, unlike the billing
 * reports: a report leaves them out because that time is already billed as
 * reserved hours and counting both would bill it twice, while this measures
 * machine time consumed, where leaving them out would understate it. A job
 * that never ran, or one whose window ends before it starts, contributes no
 * seconds — discarded rather than subtracted, the rule the reports use.
 */
export const jobsAndUsage = async (): Promise<JobUsageRow[]> =>
  sequelize().query<JobUsageRow>(
    `WITH per_project AS (
       SELECT project_id,
              COUNT(*) AS jobs,
              SUM(CASE
                    WHEN execution_start IS NOT NULL
                     AND execution_end   IS NOT NULL
                     AND execution_end  >= execution_start
                    THEN (execution_end - execution_start)
                  END) AS elapsed
         FROM jobs
        GROUP BY project_id
     )
     SELECT GROUPING(p.id) AS is_org_total,
            o.id   AS organization_id,
            o.name AS organization_name,
            p.id   AS project_id,
            p.name AS project_name,
            COALESCE(SUM(a.jobs), 0)::text AS count,
            COALESCE(EXTRACT(EPOCH FROM SUM(a.elapsed)), 0)::text AS usage_seconds
       FROM organizations o
       LEFT JOIN projects    p ON p.organization_id = o.id
       LEFT JOIN per_project a ON a.project_id = p.id
      GROUP BY GROUPING SETS ((o.id, o.name), (o.id, o.name, p.id, p.name))
      ORDER BY o.id, p.id`,
    { type: QueryTypes.SELECT },
  );

export const reservationsByOrganization = async (): Promise<
  OrganizationCount[]
> =>
  sequelize().query<OrganizationCount>(
    `SELECT o.id AS organization_id,
            o.name AS organization_name,
            COUNT(r.id)::text AS count
       FROM organizations o
       LEFT JOIN projects     p ON p.organization_id = o.id
       LEFT JOIN reservations r ON r.project_id = p.id
      GROUP BY o.id, o.name
      ORDER BY o.id`,
    { type: QueryTypes.SELECT },
  );

/** Every user on the platform. */
export const userCount = async (): Promise<number> => User.count();

/**
 * Users grouped by the domain of their address.
 *
 * A domain rather than one hardcoded institution, so the question "how many
 * students" is a label selector on a deployment-neutral series instead of a
 * site's naming baked into the code. Addresses are institutional, so the label
 * stays low-cardinality. An address with no `@` contributes to `users_total`
 * but to no domain, which is the only way the two disagree.
 */
export const usersByEmailDomain = async (): Promise<DomainCount[]> =>
  sequelize().query<DomainCount>(
    `SELECT LOWER(SPLIT_PART(u.email, '@', 2)) AS domain,
            COUNT(*)::text AS count
       FROM users u
      WHERE POSITION('@' IN u.email) > 0
      GROUP BY 1
      ORDER BY 1`,
    { type: QueryTypes.SELECT },
  );

/**
 * Projects carrying each tag, from `tags` so an unused tag reports 0.
 *
 * A project may carry several tags, so these series deliberately do not sum to
 * the number of projects — unlike the per-organization ones, which are strict.
 */
export const projectsByTag = async (): Promise<TagCount[]> =>
  sequelize().query<TagCount>(
    `SELECT t.id AS tag_id,
            t.name AS tag_name,
            COUNT(pt."projectId")::text AS count
       FROM tags t
       LEFT JOIN "ProjectTags" pt ON pt."tagId" = t.id
      GROUP BY t.id, t.name
      ORDER BY t.id`,
    { type: QueryTypes.SELECT },
  );
