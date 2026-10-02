import { z } from "zod";
import { identitySchema } from "./identity.ts";

export const createUserSchema = z.object({
  // identity field: e-mail or free-form per the frozen USERNAME_FORMAT
  email: identitySchema,
  organization_id: z.number().nullish(),
  default_project_id: z.number().nullish(),
  organization_manager: z.boolean().nullish(),
  organization_auditor: z.boolean().nullish(),
  pulla_user: z.boolean().nullish(),
});

export const updateUserSchema = createUserSchema.partial();

export type CreateUserDto = z.infer<typeof createUserSchema>;
export type UpdateUserDto = z.infer<typeof updateUserSchema>;
