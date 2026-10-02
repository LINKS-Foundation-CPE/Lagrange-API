import { z } from "zod";
import { usernameFormat } from "../config/usernamePolicy.ts";

/**
 * Validator for the user identity field (`users.email`, reported as
 * `username` by the QC Gateway job reports). Its shape is a frozen
 * deployment decision (see config/usernamePolicy.ts): e-mail address under
 * USERNAME_FORMAT=email, any whitespace-free string under =any. Evaluated at
 * parse time so the frozen value (resolved at startup) is honoured.
 */
export const identitySchema = z
  .string()
  .min(1)
  .superRefine((val, ctx) => {
    if (usernameFormat() === "email") {
      if (!z.email().safeParse(val).success) {
        ctx.addIssue({
          code: "custom",
          message: "Invalid email (deployment uses USERNAME_FORMAT=email)",
        });
      }
    } else if (/\s/.test(val)) {
      ctx.addIssue({
        code: "custom",
        message: "username must not contain whitespace",
      });
    }
  });
