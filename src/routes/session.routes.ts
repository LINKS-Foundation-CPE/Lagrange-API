import express, { Router } from "express";
import * as controller from "controllers/session.controller.ts";
import { validate } from "middleware/validate";
import {
  authorizeSessionSchema,
  reportSessionSchema,
} from "schemas/session.schema.ts";

/**
 * Machine endpoints for QPU sessions, called by the QC Gateway like /jobReport
 * and /userRoles: no credential, internal network only. The gateway has already
 * authenticated the user (OIDC or a Sqed job token) and passes the identity.
 * The body is parsed whatever content-type it claims, as on /jobAuthorizer: a
 * mis-framed request must fail validation, not arrive empty.
 */
export const sessionAuthorizerRouter = Router();
sessionAuthorizerRouter.post(
  "/",
  express.json({ type: () => true }),
  validate(authorizeSessionSchema),
  controller.authorize,
);

export const sessionReportRouter = Router();
sessionReportRouter.post(
  "/",
  express.json({ type: () => true }),
  validate(reportSessionSchema),
  controller.report,
);
