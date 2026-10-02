import { Router } from "express";
import * as controller from "controllers/announcement.controller";
import { requireRoles } from "middleware/authorizeByRole";
import { validate } from "middleware/validate";
import {
  creatAnnouncementSchema,
  updateAnnouncementSchema,
} from "schemas/announcement.schema";

const router = Router();

router.post(
  "/",
  requireRoles("admin"),
  validate(creatAnnouncementSchema),
  controller.create,
);

router.put(
  "/:id",
  requireRoles("admin"),
  validate(updateAnnouncementSchema),
  controller.update,
);

router.get("/", controller.getList);
router.get("/:id", controller.getOne);

router.delete("/:id", requireRoles("admin"), controller.destroy);

export default router;
