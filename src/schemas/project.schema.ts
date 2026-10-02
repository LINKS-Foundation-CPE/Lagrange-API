import { z } from "zod";

export const createProjectSchema = z.object({
  name: z.string().min(3),
  budget: z.number().nonnegative().multipleOf(1).optional(),
  start_at: z.iso.date().nullish().optional(),
  end_at: z.iso.date().nullish().optional(),
  organization_id: z.number().int(),
  free_queue: z.boolean().optional(),
});

export const updateProjectSchema = createProjectSchema; //.partial();

export type CreateProjectDto = z.infer<typeof createProjectSchema>;
export type UpdateProjectDto = z.infer<typeof updateProjectSchema>;
