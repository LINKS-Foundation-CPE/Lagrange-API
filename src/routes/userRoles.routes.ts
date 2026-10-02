import { Router } from "express";
import * as userRolesController from "../controllers/userRoles.controller.ts";

/**
 * Machine endpoint for the QC Gateway (like /jobAuthorizer and /jobReport):
 * resolves the platform roles of a user identity so the gateway's Sqed auth
 * plugin can grant sweep access (pulla_user) per user. Internal network only.
 */
const router = Router();

router.get("/:username", userRolesController.getRoles);

export default router;
