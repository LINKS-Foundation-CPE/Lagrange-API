import * as jobService from "./job.service.ts";
import * as repo from "../repositories/metrics.repository.ts";

/**
 * The samples the Prometheus endpoint exposes, as data. Rendering them into
 * the exposition format is the controller's job.
 */
export interface Sample {
  name: string;
  labels?: Record<string, string>;
  value: number;
}

const organizationLabels = (row: {
  organization_id: number;
  organization_name: string;
}) => ({
  organization_id: String(row.organization_id),
  organization: row.organization_name,
});

/**
 * A project carries its organization as a label so a panel can group by it
 * without joining anything. Only rows that really are a project reach here,
 * so `project_id` is non-null by then.
 */
const projectLabels = (row: repo.JobUsageRow) => ({
  project_id: String(row.project_id),
  project: row.project_name ?? "",
  ...organizationLabels(row),
});

const organizationSamples = (
  name: string,
  rows: repo.OrganizationCount[],
): Sample[] =>
  rows.map((row) => ({
    name,
    labels: organizationLabels(row),
    value: Number(row.count),
  }));

export const getSamples = async (): Promise<Sample[]> => {
  const [
    statusCounts,
    jobUsage,
    reservationsByOrg,
    users,
    usersByDomain,
    projectsByTag,
  ] = await Promise.all([
    jobService.getMetrics(),
    repo.jobsAndUsage(),
    repo.reservationsByOrganization(),
    repo.userCount(),
    repo.usersByEmailDomain(),
    repo.projectsByTag(),
  ]);

  // One query returns both levels. `is_org_total` is the discriminator rather
  // than a null project, because an organization with no projects yields a
  // project-level row whose project is null and which is not its total.
  const byOrganization = jobUsage.filter((row) => row.is_org_total === 1);
  const byProject = jobUsage.filter(
    (row) => row.is_org_total === 0 && row.project_id !== null,
  );

  return [
    // `jobs_total` and one `jobs_<status>` per status present in the table.
    // Unlabelled and unchanged: Prometheus already scrapes these series.
    ...Object.entries(statusCounts).map(([key, value]) => ({
      name: `jobs_${key}`,
      value,
    })),
    ...organizationSamples("jobs_by_organization", byOrganization),
    ...organizationSamples("reservations_by_organization", reservationsByOrg),
    // QPU time actually executed, in seconds. Seconds rather than hours
    // because the unit belongs in the metric name and the conversion belongs
    // in the query that asks for hours.
    ...byOrganization.map((row) => ({
      name: "qpu_seconds_by_organization",
      labels: organizationLabels(row),
      value: Number(row.usage_seconds),
    })),
    ...byProject.map((row) => ({
      name: "jobs_by_project",
      labels: projectLabels(row),
      value: Number(row.count),
    })),
    ...byProject.map((row) => ({
      name: "qpu_seconds_by_project",
      labels: projectLabels(row),
      value: Number(row.usage_seconds),
    })),
    { name: "users_total", value: users },
    // One series per address domain: "how many students" is then a selector,
    // `users_by_email_domain{domain="studenti.polito.it"}`, rather than a
    // site's naming compiled into the API.
    ...usersByDomain.map((row) => ({
      name: "users_by_email_domain",
      labels: { domain: row.domain },
      value: Number(row.count),
    })),
    ...projectsByTag.map((row) => ({
      name: "projects_by_tag",
      labels: { tag_id: String(row.tag_id), tag: row.tag_name },
      value: Number(row.count),
    })),
  ];
};
