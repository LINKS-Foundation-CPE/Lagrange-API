import { z } from "zod";

export const createOrganizationSchema = z.object({
  name: z.string().min(3),
  reference_organization_id: z.number().nullish(),
  vault_project_id: z.number().optional(),
  free_queue: z.boolean(),
  initial_budget: z.int().nonnegative().nullish(),
});

export const updateOrganizationSchema = createOrganizationSchema; //.partial();

export type CreateOrganizationDto = z.infer<typeof createOrganizationSchema>;
export type UpdateOrganizationDto = z.infer<typeof updateOrganizationSchema>;
