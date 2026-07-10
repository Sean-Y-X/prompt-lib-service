import { sql } from "drizzle-orm";
import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * `internal` = a canonical prompt owned by the internal team (the source of truth
 * that can publish updates). `custom` = a copy owned by the customer, optionally
 * forked from an internal prompt.
 */
export const promptKind = pgEnum("prompt_kind", ["internal", "custom"]);

/** Who authored a given version snapshot. Drives baseline detection for merges. */
export const editedBy = pgEnum("edited_by", ["internal", "customer"]);

export const prompts = pgTable(
  "prompts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: promptKind("kind").notNull().default("custom"),
    // Fork parent: which internal prompt this custom copy was derived from.
    sourcePromptId: uuid("source_prompt_id"),
    // The source's version number this copy last incorporated. NULL for prompts
    // that were never forked. Update available when source.currentVersion > this.
    syncedSourceVersion: integer("synced_source_version"),
    title: text("title").notNull(),
    description: text("description").notNull(),
    template: text("template").notNull(),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    // Denormalized pointer to the latest version number in prompt_versions.
    currentVersion: integer("current_version").notNull().default(1),
    renderCount: integer("render_count").notNull().default(0),
    lastRenderedAt: timestamp("last_rendered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // GIN index enables efficient array-containment tag search.
    index("prompts_tags_gin").using("gin", t.tags),
    index("prompts_source_idx").on(t.sourcePromptId),
  ],
);

/**
 * Append-only history. Every edit to any prompt writes a new snapshot here rather
 * than mutating in place — this is what makes 3-way merges (base vs customer vs
 * internal) possible. `editedBy` lets us find a customer copy's last synced
 * baseline (its most recent `internal` snapshot).
 */
export const promptVersions = pgTable(
  "prompt_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    promptId: uuid("prompt_id")
      .notNull()
      .references(() => prompts.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    template: text("template").notNull(),
    tags: text("tags").array().notNull(),
    editedBy: editedBy("edited_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique("prompt_versions_prompt_version_uq").on(t.promptId, t.versionNumber)],
);

export type Prompt = typeof prompts.$inferSelect;
export type NewPrompt = typeof prompts.$inferInsert;
export type PromptVersion = typeof promptVersions.$inferSelect;
export type NewPromptVersion = typeof promptVersions.$inferInsert;
