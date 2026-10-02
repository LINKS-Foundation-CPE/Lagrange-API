import { Router } from "express";
import * as metricsController from "controllers/metrics.controller";

const router = Router();

router.get("/jobs", metricsController.getMetrics);

export default router;
