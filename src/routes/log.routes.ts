import { Router } from "express";
import * as controller from "controllers/log.controller.ts";
import { requireRoles } from "middleware/authorizeByRole";

const router = Router();

router.get(
  "/",
  requireRoles("admin"),
  //restrictToOrganization,
  controller.getList,
);

router.get("/:id", requireRoles("admin"), controller.getOne);

export default router;
