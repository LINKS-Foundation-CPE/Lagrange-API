import { z } from "zod";

/**
 * A tag name is a label in a controlled vocabulary, so it is normalised on the
 * way in: trimmed, and required to be non-empty after trimming. Uniqueness is
 * the database's (the column is unique) and is reported as a conflict by the
 * service rather than checked here.
 */
const name = z
  .string()
  .trim()
  .min(1, "name must not be empty")
  .max(64, "name must be at most 64 characters");

export const createTagSchema = z.object({ name });

export const updateTagSchema = z.object({ name });

/**
 * Assigning tags to a project replaces the whole set, so an empty array is a
 * meaningful request: it clears them. Ids rather than names, deliberately —
 * accepting names would invite creating a tag by typo, which is the one thing a
 * controlled vocabulary exists to prevent.
 */
export const projectTagsSchema = z.object({
  tag_ids: z.array(z.number().int().positive()),
});
