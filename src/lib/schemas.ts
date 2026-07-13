import { z } from "zod";

/**
 * Shared zod schemas — the single source of truth for request validation across
 * the API routes. Kept deliberately close to the DB column types in
 * src/db/schema.ts.
 */

export const tagSchema = z.string().trim().min(1).max(40);

/**
 * The four content fields that define a prompt. Deliberately carries NO defaults:
 * defaults belong only on the create path. If `description`/`tags` defaulted here,
 * `.partial()` (used for updates) would still fill omitted keys via the inner
 * ZodDefault, so a PATCH of just `title` would arrive as `{title, description: "",
 * tags: []}` and silently wipe those fields.
 */
export const promptContentSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().trim().max(2000),
  template: z.string().min(1, "Template is required").max(10_000),
  tags: z.array(tagSchema).max(30),
});
export type PromptContentInput = z.infer<typeof promptContentSchema>;

/** Create a prompt. Optional `description`/`tags` default in only on this path. */
export const createPromptSchema = z.object({
  kind: z.enum(["internal", "custom"]).default("custom"),
  content: promptContentSchema.extend({
    description: promptContentSchema.shape.description.default(""),
    tags: promptContentSchema.shape.tags.default([]),
  }),
});

/** Update: any non-empty subset of the content fields (no defaults applied). */
export const updatePromptSchema = promptContentSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, "No fields to update");

export const renderSchema = z.object({
  variables: z.record(z.string(), z.string()).default({}),
});

/** AI drafting: turn a free-text brief into a prompt draft (not persisted). */
export const draftSchema = z.object({
  brief: z.string().trim().min(1, "Brief is required").max(2000),
});

export const forkSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
});

export const acceptUpdateSchema = z.object({
  // Customer's choice for each conflicting scalar field; omitted = keep mine.
  resolutions: z
    .object({
      title: z.enum(["customer", "internal"]).optional(),
      description: z.enum(["customer", "internal"]).optional(),
      template: z.enum(["customer", "internal"]).optional(),
    })
    .default({}),
});
