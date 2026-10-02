import { Router } from "express";
import * as controller from "controllers/tag.controller";
import { requireRoles } from "middleware/authorizeByRole";
import { validate } from "middleware/validate";
import { createTagSchema, updateTagSchema } from "schemas/tag.schema";

const router = Router();

/**
 * The tag vocabulary. Readable by any authenticated user — a project admin
 * needs the list to pick from — and writable only by platform admins, which is
 * what makes it a controlled vocabulary rather than free text.
 */
router.get("/", controller.getList);
router.get("/:id", controller.getOne);

router.post(
  "/",
  requireRoles("admin"),
  validate(createTagSchema),
  controller.create,
);

router.put(
  "/:id",
  requireRoles("admin"),
  validate(updateTagSchema),
  controller.update,
);

router.delete("/:id", requireRoles("admin"), controller.destroy);

export default router;
