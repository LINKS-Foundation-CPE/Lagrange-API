import { Router, Request, Response } from "express";
import { policy } from "config/policy.ts";

/**
 * Public, unauthenticated endpoint exposing the client-relevant subset of the
 * deployment policy flags so the dashboard can adapt its UI (e.g. hide the
 * slots views when reservations are not slot-constrained). Only booleans that
 * are safe to reveal publicly are returned — never secrets or internal config.
 */
const router = Router();

router.get("/", (_req: Request, res: Response) => {
  res.json({
    slotConstrainedReservations: policy.slotConstrainedReservations,
    // The dashboard hides everything but the jobs views when this is set: the
    // endpoints behind them are not mounted, so showing them would only produce
    // 404s.
    jobPortalOnly: policy.jobPortalOnly,
  });
});

export default router;
