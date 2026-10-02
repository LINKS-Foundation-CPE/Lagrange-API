import { Router } from "express";
import * as controller from "controllers/job.controller";
import { requireRoles } from "middleware/authorizeByRole";
import { restrictToUser } from "middleware/restrictToUser.ts";

const router = Router();

router.get("/", restrictToUser, controller.getList);

router.get("/:id", restrictToUser, controller.getOne);

export default router;
