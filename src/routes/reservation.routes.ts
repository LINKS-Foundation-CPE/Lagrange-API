import { Router } from "express";
import { validate } from "../middleware/validate.ts";
import { requireRoles } from "../middleware/authorizeByRole.ts";
import * as controller from "../controllers/reservation.controller.ts";
import {
  createReservationSchema,
  createReservationSeriesSchema,
  updateReservationSchema,
} from "../schemas/reservation.schema.ts";
import * as seriesController from "../controllers/series.controller.ts";

const router = Router();

router.get("/", controller.getList);

router.get("/:id", controller.getOne);

// Recurring series: preview with `dry_run`, create, delete all future ones.
router.post(
  "/series",
  requireRoles("admin", "organization-manager", "project-admin"),
  validate(createReservationSeriesSchema),
  seriesController.createReservationSeries,
);
router.delete(
  "/series/:seriesId",
  requireRoles("admin", "organization-manager", "project-admin"),
  seriesController.destroyReservationSeries,
);

router.post(
  "/",
  requireRoles("admin", "organization-manager", "project-admin"),
  validate(createReservationSchema),
  controller.create,
);

router.put(
  "/:id",
  requireRoles("admin", "organization-manager", "project-admin"),
  validate(updateReservationSchema),
  controller.update,
);

router.delete(
  "/:id",
  requireRoles("admin", "organization-manager", "project-admin"),
  controller.destroy,
);

export default router;
