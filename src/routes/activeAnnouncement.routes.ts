import { Router } from "express";
import * as controller from "controllers/announcement.controller";

const router = Router();

router.get("/", controller.getListActive);
router.get("/:id", controller.getOne);

export default router;
