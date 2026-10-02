import { ZodSchema } from "zod";
import { Request, Response, NextFunction } from "express";
import CustomError from "config/CustomError.ts";
import logger from "config/logger.ts";

export const validate =
  (schema: ZodSchema) => (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      logger.debug("schema validation error");
      const error = result.error;
      logger.debug(error);

      const errors = Object.fromEntries(
        error.issues.map((issue) => [
          issue.path.join("."), // "email", "password", "address.city", etc.
          issue.message,
        ]),
      );
      throw new CustomError({
        statusCode: 400,
        message: `Validation failed: ${result.error}`,
        errors,
      });
    }
    req.body = result.data; // sanitized data
    next();
  };

/**
 * Same as `validate`, for query strings.
 *
 * Query values arrive as strings, so the schema is expected to coerce; the
 * parsed result replaces `req.validatedQuery` rather than `req.query`, which
 * Express 5 exposes as a getter.
 */
export const validateQuery =
  (schema: ZodSchema) => (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      logger.debug("query validation error");
      logger.debug(result.error);

      const errors = Object.fromEntries(
        result.error.issues.map((issue) => [
          issue.path.join("."),
          issue.message,
        ]),
      );
      throw new CustomError({
        statusCode: 400,
        message: `Validation failed: ${result.error}`,
        errors,
      });
    }
    req.validatedQuery = result.data;
    next();
  };
