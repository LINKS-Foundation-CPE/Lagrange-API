import { SystemConfig } from "../models/systemConfig.ts";
import logger from "./logger.ts";

/**
 * Deployment decision: is the user identity (`users.email`, reported as
 * `username` by the QC Gateway) required to be an e-mail address?
 *
 *   USERNAME_FORMAT=email  — historical Lagrange behaviour (default)
 *   USERNAME_FORMAT=any    — any whitespace-free string (e.g. HPC cluster
 *                            account names in the Sqed/CINECA deployment)
 *
 * The value is FROZEN at first deployment: `freezeUsernameFormat()` persists
 * it in the `system_configs` table on first boot and refuses to start the
 * server if a later deployment sets a conflicting value — changing it once
 * users exist would break validation of existing identities and silently
 * change billing attribution. An unset env var adopts the frozen value.
 */

export type UsernameFormat = "email" | "any";

const CONFIG_KEY = "username_format";
const DEFAULT_FORMAT: UsernameFormat = "email";

let effective: UsernameFormat | null = null;

export function envUsernameFormat(): UsernameFormat | null {
  const raw = process.env.USERNAME_FORMAT;
  if (raw === undefined || raw === "") return null;
  const v = raw.trim().toLowerCase();
  if (v === "email" || v === "any") return v;
  throw new Error(
    `Invalid USERNAME_FORMAT '${raw}' (expected 'email' or 'any')`,
  );
}

/**
 * Effective format for validation. Before `freezeUsernameFormat()` has run
 * (tests, tooling) this falls back to the env var, then to the default.
 */
export function usernameFormat(): UsernameFormat {
  return effective ?? envUsernameFormat() ?? DEFAULT_FORMAT;
}

/** Test hook: override/clear the frozen value without touching the DB. */
export function _setUsernameFormatForTests(v: UsernameFormat | null): void {
  effective = v;
}

/**
 * Freeze-at-first-deployment handshake. Call once at server startup, after
 * the database is reachable. Throws (server must not start) when the env var
 * conflicts with the frozen value.
 */
export async function freezeUsernameFormat(): Promise<UsernameFormat> {
  const env = envUsernameFormat();
  const stored = await SystemConfig.findByPk(CONFIG_KEY);

  if (!stored) {
    const value = env ?? DEFAULT_FORMAT;
    await SystemConfig.create({ key: CONFIG_KEY, value });
    effective = value;
    logger.info(`username format frozen at first deployment: '${value}'`);
    return value;
  }

  const frozen = stored.value as UsernameFormat;
  if (env !== null && env !== frozen) {
    throw new Error(
      `USERNAME_FORMAT='${env}' conflicts with the value frozen at first ` +
        `deployment ('${frozen}'). This setting cannot be changed once the ` +
        `deployment exists; unset USERNAME_FORMAT or restore '${frozen}'.`,
    );
  }
  effective = frozen;
  logger.info(`username format (frozen): '${frozen}'`);
  return frozen;
}
