import express, { Router } from "express";
import * as controller from "../controllers/organization.controller.ts";
import { validate } from "../middleware/validate.ts";
import { requireRoles } from "../middleware/authorizeByRole.ts";
import { restrictOrganization } from "../middleware/restrictOrganization.ts";
import {
  createOrganizationSchema,
  updateOrganizationSchema,
} from "../schemas/organization.schema.ts";

const router = Router();

router.get(
  "/",
  //requireRoles("admin", "organization-manager"),
  restrictOrganization,
  controller.getList,
);

router.get(
  "/:id",
  //requireRoles("admin", "organization-manager"),
  //restrictToOrganization,
  controller.getOne,
);

router.post(
  "/",
  requireRoles("admin"),
  validate(createOrganizationSchema),
  controller.create,
);

router.put(
  "/:id",
  requireRoles("admin"),
  validate(updateOrganizationSchema),
  controller.update,
);

router.post(
  "/:id/budgetTransfer",
  requireRoles("admin", "organization-manager"),
  // TODO: validate
  controller.budgetTransfer,
);

router.get(
  "/:id/jobs",
  requireRoles("admin", "organization-manager"),
  controller.getJobList,
);

export default router;
