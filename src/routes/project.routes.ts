import { Router } from "express";
import * as controller from "controllers/project.controller";
import { validate } from "middleware/validate";
import { requireRoles } from "middleware/authorizeByRole";
import { restrictToOrganization } from "middleware/restrictToOrganization";
import {
  createProjectSchema,
  updateProjectSchema,
} from "schemas/project.schema";
import { restrictToUser } from "middleware/restrictToUser.ts";
import { authorizeByProjectAdmin } from "middleware/authorizeByProjectAdmin.ts";
import * as tagController from "controllers/tag.controller";
import { projectTagsSchema } from "schemas/tag.schema";

const router = Router();

router.get(
  "/",
  //requireRoles("admin", "organization-manager"),
  //restrictToOrganization,
  controller.getList,
);

router.get("/:id", controller.getOne);

router.post(
  "/",
  requireRoles("admin", "organization-manager"),
  validate(createProjectSchema),
  controller.create,
);

router.put(
  "/:id",
  requireRoles("admin", "organization-manager"),
  validate(updateProjectSchema),
  controller.update,
);

router.get(
  "/:id/users",
  requireRoles("admin", "organization-manager", "project-admin"),
  authorizeByProjectAdmin,
  controller.getUserList,
);

router.post(
  "/:id/users",
  requireRoles("admin", "organization-manager", "project-admin"),
  authorizeByProjectAdmin,
  // TODO: validate
  controller.addUser,
);

router.get(
  "/:id/transactions",
  requireRoles("admin", "organization-manager", "project-admin"),
  authorizeByProjectAdmin,
  controller.getTransactionList,
);

/**
 * Tags on a project. Assignment is a project-admin capability, not a project
 * *update* one: PUT /projects/:id is admin and organization-manager only, and
 * widening it so a PI could set tags would also let them change budgets and
 * dates. Same guard as the other project sub-resources.
 */
router.get(
  "/:id/tags",
  requireRoles("admin", "organization-manager", "project-admin"),
  authorizeByProjectAdmin,
  tagController.getForProject,
);

router.put(
  "/:id/tags",
  requireRoles("admin", "organization-manager", "project-admin"),
  authorizeByProjectAdmin,
  validate(projectTagsSchema),
  tagController.setForProject,
);

router.get(
  "/:id/jobs",
  //requireRoles("admin", "organization-manager", "project-admin"),
  authorizeByProjectAdmin,
  controller.getJobList,
);

export default router;
