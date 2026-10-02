import { Router } from "express";
import * as controller from "controllers/notification.controller.ts";

const router = Router();

// Scoping lives in the service: notifications are personal, so admins are
// not exempt the way restrictToUser exempts them elsewhere.
router.get("/", controller.getList);
router.get("/:id", controller.getOne);
//router.put("/:id", controller.update);
router.patch("/:id/read", controller.updateRead);
//router.delete("/:id", requireRoles("admin"), controller.destroy);

export default router;
