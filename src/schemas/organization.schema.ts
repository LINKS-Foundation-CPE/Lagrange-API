import { z } from "zod";

export const createOrganizationSchema = z.object({
  name: z.string().min(3),
  reference_organization_id: z.number().nullish(),
  vault_project_id: z.number().optional(),
  free_queue: z.boolean(),
  initial_budget: z.int().nonnegative().nullish(),
});

export const updateOrganizationSchema = createOrganizationSchema; //.partial();

/**
 * Refilling an organization's vault: an amount in the budget unit (ms of QPU
 * time, like transfers), and an optional note for the ledger, such as the
 * contract or order it comes from.
 */
export const vaultRefillSchema = z.object({
  amount: z.number().int().positive(),
  note: z.string().trim().max(120).optional(),
});

export type VaultRefillDto = z.infer<typeof vaultRefillSchema>;
export type CreateOrganizationDto = z.infer<typeof createOrganizationSchema>;
export type UpdateOrganizationDto = z.infer<typeof updateOrganizationSchema>;
