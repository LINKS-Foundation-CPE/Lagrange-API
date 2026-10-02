import express, { Router } from "express";
import * as jobAuthorizerController from "../controllers/jobAuthorizer.controller.ts";
import { verifyKeycloakToken } from "../middleware/verifyKeycloakToken.ts";

const router = Router();

// Parse the body whatever content-type it claims. The default parser accepts
// only `application/json` and, for anything else, hands the route an empty
// body — indistinguishable here from a caller that claimed no project and no
// job type, and authorization then falls through to the user's default project
// and allows the job. A mis-framed request on this endpoint has to fail loudly
// (body-parser answers 400) rather than quietly widen what is permitted.
router.post(
  "/",
  verifyKeycloakToken,
  express.json({ type: () => true }),
  jobAuthorizerController.authorizeJob,
);

export default router;
