import { Router } from "express";
import * as controller from "controllers/jobReport.controller.ts";
import { validate } from "middleware/validate";
import {
  createJobReportSchema,
  updateJobReportSchema,
} from "schemas/jobReport.schema.ts";

const router = Router();

router.post("/", validate(createJobReportSchema), controller.create);

router.put("/:jobid", validate(updateJobReportSchema), controller.update);

export default router;
