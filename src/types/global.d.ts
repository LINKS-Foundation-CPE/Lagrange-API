import { Sequelize, Order } from "sequelize";
import { createApp } from "app";
import { initModels } from "models/index";
import { AuthUser } from "./auth.ts";

declare global {
  var __SEQUELIZE__: Sequelize;
  var __APP__: ReturnType<typeof createApp>;
  var __MODELS__: ReturnType<typeof initModels>;

  namespace Express {
    interface Request {
      // Populated by the authentication middleware.
      user: AuthUser;
      // Query pagination/filtering populated by `parseQueryIntoFilters`.
      limit: number;
      offset: number;
      filters: Record<string, unknown>;
      order: Order;
      // Legacy field referenced by the job authorizer flow.
      sub?: string;
      // Query params parsed by `validateQuery`; Express 5 makes `query` a
      // getter, so the sanitized values cannot be written back onto it.
      validatedQuery?: unknown;
    }
  }
}
