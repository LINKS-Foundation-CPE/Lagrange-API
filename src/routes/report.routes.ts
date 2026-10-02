import { Router } from "express";
import * as controller from "controllers/report.controller.ts";
import { requireRoles } from "middleware/authorizeByRole";
import { validateQuery } from "middleware/validate.ts";
import { reportQuerySchema } from "schemas/report.schema.ts";

const router = Router();

/**
 * Billing reports for a period.
 *
 * Open to platform admins and to organization managers and auditors, who are
 * scoped to their own organization by the service. Project admins are not
 * included: these are per-organization accounting figures, and a PI's view of
 * their own project's consumption is the budget ledger, not this.
 */
router.use(
  requireRoles(
    "admin",
    "readOnlyAdmin",
    "organization-manager",
    "organization-auditor",
  ),
  validateQuery(reportQuerySchema),
);

router.get("/reservations", controller.getReservations);
router.get("/jobs", controller.getJobs);
router.get("/slots", controller.getSlots);
router.get("/utilization", controller.getUtilization);
router.get("/summary", controller.getSummary);

export default router;
