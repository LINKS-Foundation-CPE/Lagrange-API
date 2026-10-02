import logger from "./logger.ts";

/**
 * Deployment policy flags.
 *
 * Read from the environment on every access (getters) so tests can toggle
 * them per-case. Defaults preserve the historical Lagrange behaviour.
 */

const parseBool = (name: string, dflt: boolean): boolean => {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return dflt;
  const v = raw.trim().toLowerCase();
  if (v === "true" || v === "1") return true;
  if (v === "false" || v === "0") return false;
  logger.warn(`Invalid boolean for ${name}: '${raw}' — using default ${dflt}`);
  return dflt;
};

export const policy = {
  /**
   * When true (default), reservations must be placed inside a pre-allocated
   * slot belonging to the project's organization (or its reference
   * organization). When false, reservations can be placed freely on the
   * calendar: `slot_id` becomes optional and no slot ownership/window checks
   * are applied (overlap, project window and budget checks still hold).
   */
  get slotConstrainedReservations(): boolean {
    return parseBool("SLOT_CONSTRAINED_RESERVATIONS", true);
  },

  /**
   * When true (default), during another organization's pre-allocated slot
   * the open queue stays available to everyone (jobs are admitted on
   * free-queue/budget rules regardless of the slot owner). When false, only
   * users belonging to the slot's organization — or to an organization whose
   * `reference_organization_id` is the slot's organization — may submit
   * while the slot is active (outside reservations, which always take
   * precedence).
   */
  get allowForeignOrgQueueInSlots(): boolean {
    return parseBool("ALLOW_FOREIGN_ORG_QUEUE_IN_SLOTS", true);
  },

  /**
   * When false (default), a job is billed the QPU time the machine reported:
   * `execution_end - execution_start`, in milliseconds. This is the only
   * behaviour Lagrange has ever had.
   *
   * When true, the terminal `PUT /jobReport/{jobid}` may instead carry an
   * explicit `billable` amount, and that amount is what gets charged. The unit
   * is whatever the deployment bills in — it is charged verbatim against
   * `projects.remaining_budget`, so **keeping the unit consistent with the
   * budgets is the operator's responsibility**; nothing here can check it.
   *
   * Exists for deployments whose charge is not the execution window: on an
   * HPC cluster the billable quantity may be the QPU licenses a batch job
   * held for its wall time, which no pair of execution timestamps can
   * express. A report with no `billable` field still bills the timestamps, so
   * a deployment can mix the two.
   */
  get acceptReportedBilling(): boolean {
    return parseBool("ACCEPT_REPORTED_BILLING", false);
  },

  /**
   * When true, this deployment's portal is a **job viewer and nothing else**.
   *
   * For a site that owns authorization and accounting elsewhere — a SLURM
   * cluster charging its own licenses, say — where the only reason users touch
   * this API is to find the jobs they ran. Two effects:
   *
   * 1. The management surface is **not mounted**: users, projects,
   *    organizations, slots, reservations, logs, budget events, announcements,
   *    notifications, project membership, the per-user project selection, and
   *    `/jobAuthorizer`. Those paths 404 rather than 403 — the capability is
   *    absent, not merely refused.
   * 2. **Nothing is billed.** A terminal job report still records the job and
   *    its timing, but no project budget is debited and no ledger row is
   *    written, because the charge is not this system's to make.
   *
   * What remains is what a user needs to see their own jobs — `GET /api/jobs`
   * (already scoped to the caller by `restrictToUser`) and `/auth/token` to log
   * in — plus the machine endpoints that populate them: `/jobReport`,
   * `/userRoles`, `/metrics`.
   *
   * Default false: existing deployments are full portals and change nothing.
   */
  get jobPortalOnly(): boolean {
    return parseBool("JOB_PORTAL_ONLY", false);
  },
};
