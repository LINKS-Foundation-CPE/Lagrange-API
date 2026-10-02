import express from "express";
import bodyParser from "body-parser";
import { Sequelize } from "sequelize";
import cors from "cors";
import logger from "./config/logger.ts";
import { policy } from "./config/policy.ts";

import {
  userRoutes,
  userOwnRoutes,
  //roleRoutes,
  projectRoutes,
  organizationRoutes,
  slotRoutes,
  reservationRoutes,
  jobRoutes,
  tokenRoutes,
  //prjUsersRoutes,
  logRouter,
  budgetEventRouter,
  announcementRoutes,
  activeAnnouncementsRouter,
  notificationRoutes,
  projectsUsersRoutes,
  metricsRoutes,
  reportRoutes,
  tagRoutes,
} from "./routes/index.ts";
import swaggerUi from "swagger-ui-express";
import { load as yamlLoad } from "js-yaml";
import fs from "fs";
import path from "path";
import configRouter from "./routes/config.routes.ts";
import { authenticateJWT } from "./middleware/authenticateJWT.ts";
import errorHandler from "./middleware/errorHandler.ts";
import jobAuthorizerRouter from "./routes/jobAuthorizer.routes.ts";
import jobReportRouter from "./routes/jobReport.routes.ts";
import userRolesRouter from "./routes/userRoles.routes.ts";
import { initModels } from "./models/index.ts";
import { parseQueryIntoFilters } from "middleware/parseQuery.ts";

export const createApp = (sequelize: Sequelize) => {
  initModels(sequelize);

  const app = express();
  app.use(bodyParser.json());

  // enable CORS if not on localhost
  if (process.env.CORS_ORIGIN) {
    logger.info("using CORS ORIGIN: ", process.env.CORS_ORIGIN);
    app.use(
      cors({
        // origin: Configures the Access-Control-Allow-Origin CORS header.
        origin: process.env.CORS_ORIGIN,
        // credentials: Configures the Access-Control-Allow-Credentials CORS header.
        credentials: true,
        // allowedHeaders: Configures the Access-Control-Allow-Headers CORS header.
        // allowedHeaders: ['Content-Type', 'Authorization'],
        //
        // methods: Configures the Access-Control-Allow-Methods CORS header.
        // exposedHeaders: Configures the Access-Control-Expose-Headers CORS header.
        // maxAge: Configures the Access-Control-Max-Age CORS header.
        // preflightContinue: Pass the CORS preflight response to the next handler.
        // optionsSuccessStatus: Provides a status code to use for successful OPTIONS requests, since some legacy browsers (IE11, various SmartTVs) choke on 204.
      }),
    );
  } else {
    if (process.env.NODE_ENV !== "test") {
      logger.warn("CORS ORIGIN not configured");
    }
    app.use(cors());
  }

  // OpenAPI documentation (public, read-only)
  try {
    const specPath = path.resolve(process.cwd(), "api.yml");
    const openapiSpec = yamlLoad(fs.readFileSync(specPath, "utf8")) as object;
    app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(openapiSpec));
  } catch (err) {
    logger.warn("Could not load OpenAPI spec (api.yml): " + err);
  }

  // Public client-config (no auth): client-safe deployment flags
  app.use("/config", configRouter);

  // Middleware
  app.use("/api", authenticateJWT);
  app.use("/api", parseQueryIntoFilters);

  // Routes
  //
  // Job listing is always mounted: it is the one thing every deployment needs,
  // and `restrictToUser` already scopes it to the caller unless they are an
  // admin. Everything else is the management surface, which JOB_PORTAL_ONLY
  // leaves unmounted — see src/config/policy.ts.
  app.use("/api/jobs", jobRoutes);

  if (!policy.jobPortalOnly) {
    app.use("/api/users", userRoutes);
    //app.use("/api/roles", roleRoutes);
    app.use("/api/projects", projectRoutes);
    app.use("/api/organizations", organizationRoutes);
    app.use("/api/slots", slotRoutes);
    app.use("/api/reservations", reservationRoutes);
    app.use("/api/logs", logRouter);
    app.use("/api/budgetEvents", budgetEventRouter);
    app.use("/api/reports", reportRoutes);
    app.use("/api/tags", tagRoutes);
    app.use("/api/announcements", announcementRoutes);
    app.use("/api/activeAnnouncements", activeAnnouncementsRouter);
    app.use("/api/notifications", notificationRoutes);
    app.use("/api/projects_users", projectsUsersRoutes);

    app.use("/api/own", userOwnRoutes);
  } else {
    logger.info(
      "JOB_PORTAL_ONLY: serving job listing only — the management surface and /jobAuthorizer are not mounted, and nothing is billed",
    );
  }

  // route used to authenticate with a Keycloak token and get a platform token
  app.use("/auth/token", tokenRoutes);

  // Authorization is the site's own concern when the portal is a job viewer,
  // so the endpoint that grants or refuses submissions is not mounted either.
  if (!policy.jobPortalOnly) {
    app.use("/jobAuthorizer", jobAuthorizerRouter);
  }

  // Machine endpoints: these POPULATE the job list, so they stay in both modes.
  app.use("/jobReport", jobReportRouter);
  app.use("/userRoles", userRolesRouter);
  app.use("/metrics", metricsRoutes);

  // generic error handler middleware
  app.use(errorHandler);

  return app;
};
