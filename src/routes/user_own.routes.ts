import express, { Router } from "express";
import { restrictToUser } from "middleware/restrictToUser.ts";
import * as controller from "controllers/user.controller.ts";
import { validate } from "middleware/validate.ts";
import { updateUserSchema } from "schemas/user.schema.ts";

const router = Router();

router.get("/projects", /* restrictToUser, */ controller.getUserProjects);
router.get("/default_project", controller.getUserDefaultProject);
router.put(
  "/default_project",
  validate(updateUserSchema),
  controller.setUserDefaultProject,
);

export default router;
