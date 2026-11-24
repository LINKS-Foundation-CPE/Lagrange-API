import { z } from "zod";
import { identitySchema } from "./identity.ts";

/** POST /sessionAuthorizer — may this user open a session, and for how long. */
export const authorizeSessionSchema = z.object({
  username: identitySchema,
  project_name: z.string().nullish(),
  /** What the client asked for. */
  requested_seconds: z.number().int().positive(),
  /**
   * The deployment's default limit (the gateway's SESSION_MAX_SECONDS), for a
   * user with no cap of their own. A user's own cap replaces it, up or down.
   */
  default_max_seconds: z.number().int().positive(),
});

/** POST /sessionReport — the machine accepted it: record it and charge it. */
export const reportSessionSchema = z.object({
  username: identitySchema,
  project_name: z.string().nullish(),
  /** The vendor's id for the session; becomes the row's `jobid`. */
  session_id: z.string().min(1),
  /** The vendor's term, e.g. `iteration`; becomes the row's `job_type`. */
  session_kind: z.string().min(1),
  /** What /sessionAuthorizer granted, and what the machine was asked for. */
  granted_seconds: z.number().int().positive(),
  opened_at: z.iso.datetime(),
});

export type AuthorizeSessionDto = z.infer<typeof authorizeSessionSchema>;
export type ReportSessionDto = z.infer<typeof reportSessionSchema>;
