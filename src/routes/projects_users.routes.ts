import { Router } from "express";
import * as controller from "controllers/projects_users.controller";
import { validate } from "middleware/validate";
import { requireRoles } from "middleware/authorizeByRole";

const router = Router();

router.put(
  "/:id",
  requireRoles("admin", "organization-manager"),
  //validate(updateProjectSchema),
  controller.update,
);

router.delete(
  "/:id",
  requireRoles("admin", "organization-manager", "project-admin"),
  //validate(updateProjectSchema),
  controller.destroy,
);

export default router;
