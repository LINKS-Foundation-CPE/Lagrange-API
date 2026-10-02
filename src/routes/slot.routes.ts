import express, { Router } from "express";
import * as controller from "../controllers/slot.controller.ts";
import { validate } from "../middleware/validate.ts";
import { requireRoles } from "../middleware/authorizeByRole.ts";
import { restrictToOrganization } from "../middleware/restrictToOrganization.ts";
import {
  createSlotSchema,
  createSlotSeriesSchema,
  updateSlotSchema,
} from "../schemas/slot.schema.ts";
import * as seriesController from "../controllers/series.controller.ts";

const router = Router();

router.get(
  "/",
  //requireRoles("admin", "organization-manager"),
  //restrictToOrganization,
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
  validate(createSlotSchema),
  controller.create,
);

router.put(
  "/:id",
  requireRoles("admin"),
  validate(updateSlotSchema),
  controller.update,
);

router.delete("/:id", requireRoles("admin"), controller.destroy);

// Recurring series: preview with `dry_run`, create, delete all future ones.
router.post(
  "/series",
  requireRoles("admin"),
  validate(createSlotSeriesSchema),
  seriesController.createSlotSeries,
);
router.delete(
  "/series/:seriesId",
  requireRoles("admin"),
  seriesController.destroySlotSeries,
);

export default router;
