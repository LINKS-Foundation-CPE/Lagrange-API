import express, { Router } from "express";
import * as userController from "controllers/user.controller.ts";
import { validate } from "../middleware/validate.ts";
import { requireRoles } from "../middleware/authorizeByRole.ts";

import { createUserSchema, updateUserSchema } from "schemas/user.schema.ts";
import { restrictToOrganization } from "middleware/restrictToOrganization.ts";

const router = Router();

router.get(
  "/",
  //requireRoles("admin", "organization-manager", "project-admin"),
  //restrictToOrganization,
  userController.getList,
);

router.get(
  "/:id",
  requireRoles("admin", "organization-manager", "project-admin"),
  // should not be restricted to organization in order to support projects with users from other organizations
  userController.getOne,
);

router.post(
  "/",
  requireRoles("admin", "organization-manager"),
  validate(createUserSchema),
  userController.create,
);

router.put(
  "/:id",
  requireRoles("admin", "organization-manager"),
  validate(updateUserSchema),
  userController.update,
);

router.get(
  "/:id/projects",
  requireRoles("admin", "organization-manager", "project-admin"),
  userController.getUserProjects,
);

router.get(
  "/:id/jobs",
  requireRoles("admin", "organization-manager"),
  userController.getUserJobs,
);

export default router;
