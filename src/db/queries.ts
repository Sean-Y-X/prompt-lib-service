import { and, arrayOverlaps, desc, eq, ilike, or, sql } from "drizzle-orm";
import type { PromptContent } from "@/lib/merge";
import { db } from "./index";
import { type Prompt, prompts, promptVersions } from "./schema";

/**
 * Data-access layer. Every content mutation is wrapped in a transaction that also
 * appends an immutable snapshot to prompt_versions — the prompt row and its history
 * never drift apart. `editedBy` records who authored a version, which later lets the
 * merge logic find a customer copy's last synced baseline (its latest `internal`
 * snapshot).
 */

type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Insert a version snapshot inside an existing transaction. */
async function snapshot(
  tx: DbOrTx,
  promptId: string,
  versionNumber: number,
  content: PromptContent,
  editedBy: "internal" | "customer",
): Promise<void> {
  await tx.insert(promptVersions).values({
    promptId,
    versionNumber,
    title: content.title,
    description: content.description,
    template: content.template,
    tags: content.tags,
    editedBy,
  });
}

export async function getPromptById(id: string): Promise<Prompt | undefined> {
  const [row] = await db.select().from(prompts).where(eq(prompts.id, id)).limit(1);
  return row;
}

export interface SearchParams {
  q?: string;
  tags?: string[];
  kind?: "internal" | "custom";
}

/**
 * Search across title, description, and tags. `q` matches title/description via
 * ILIKE and also any tag (by flattening the array to text). `tags` filters to
 * prompts sharing at least one of the given tags.
 */
export async function searchPrompts(params: SearchParams): Promise<Prompt[]> {
  const conditions = [];

  if (params.q) {
    const like = `%${params.q}%`;
    conditions.push(
      or(
        ilike(prompts.title, like),
        ilike(prompts.description, like),
        sql`array_to_string(${prompts.tags}, ' ') ILIKE ${like}`,
      ),
    );
  }
  if (params.tags && params.tags.length > 0) {
    conditions.push(arrayOverlaps(prompts.tags, params.tags));
  }
  if (params.kind) {
    conditions.push(eq(prompts.kind, params.kind));
  }

  return db
    .select()
    .from(prompts)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(prompts.updatedAt));
}

export interface CreatePromptInput {
  kind: "internal" | "custom";
  content: PromptContent;
}

export async function createPrompt(input: CreatePromptInput): Promise<Prompt> {
  const editedBy = input.kind === "internal" ? "internal" : "customer";
  return db.transaction(async (tx) => {
    const [prompt] = await tx
      .insert(prompts)
      .values({
        kind: input.kind,
        title: input.content.title,
        description: input.content.description,
        template: input.content.template,
        tags: input.content.tags,
        currentVersion: 1,
      })
      .returning();
    await snapshot(tx, prompt.id, 1, input.content, editedBy);
    return prompt;
  });
}

/**
 * Apply a partial content edit. Writes a new version snapshot authored by the
 * prompt's own role (internal prompt → `internal`, i.e. "publishing an update";
 * custom prompt → `customer`). Returns the updated prompt, or undefined if not found.
 */
export async function updatePrompt(
  id: string,
  patch: Partial<PromptContent>,
): Promise<Prompt | undefined> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(prompts)
      .where(eq(prompts.id, id))
      .limit(1)
      .for("update");
    if (!current) return undefined;

    const merged: PromptContent = {
      title: patch.title ?? current.title,
      description: patch.description ?? current.description,
      template: patch.template ?? current.template,
      tags: patch.tags ?? current.tags,
    };
    const nextVersion = current.currentVersion + 1;
    const editedBy = current.kind === "internal" ? "internal" : "customer";

    const [updated] = await tx
      .update(prompts)
      .set({ ...merged, currentVersion: nextVersion, updatedAt: new Date() })
      .where(eq(prompts.id, id))
      .returning();
    await snapshot(tx, id, nextVersion, merged, editedBy);
    return updated;
  });
}

/** Increment usage counters after a successful render. */
export async function recordRender(id: string): Promise<Prompt | undefined> {
  const [updated] = await db
    .update(prompts)
    .set({
      renderCount: sql`${prompts.renderCount} + 1`,
      lastRenderedAt: new Date(),
    })
    .where(eq(prompts.id, id))
    .returning();
  return updated;
}
