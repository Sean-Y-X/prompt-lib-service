import { and, arrayOverlaps, desc, eq, ilike, or, sql } from "drizzle-orm";
import {
  buildMergedContent,
  type ConflictPicks,
  mergePrompt,
  type PromptContent,
} from "@/lib/merge";
import type { UpdateStatus } from "@/lib/types";
import { db } from "./index";
import { type Prompt, prompts, promptVersions } from "./schema";

/**
 * Data-access layer. Every content mutation is wrapped in a transaction that also
 * appends an immutable snapshot to prompt_versions — the prompt row and its history
 * never drift apart. That history is what lets us reconstruct the 3-way merge base:
 * the source's content at the version a customer copy last synced from.
 */

type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Extract just the four content fields from a prompt or version row. */
function toContent(p: {
  title: string;
  description: string;
  template: string;
  tags: string[];
}): PromptContent {
  return {
    title: p.title,
    description: p.description,
    template: p.template,
    tags: p.tags,
  };
}

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

/** Load the content of a specific historical version, if it exists. */
async function getVersionContent(
  runner: DbOrTx,
  promptId: string,
  versionNumber: number,
): Promise<PromptContent | undefined> {
  const [row] = await runner
    .select()
    .from(promptVersions)
    .where(
      and(
        eq(promptVersions.promptId, promptId),
        eq(promptVersions.versionNumber, versionNumber),
      ),
    )
    .limit(1);
  return row ? toContent(row) : undefined;
}

function tagsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedB = [...b].sort();
  return [...a].sort().every((t, i) => t === sortedB[i]);
}

export async function getPromptById(id: string): Promise<Prompt | undefined> {
  const [row] = await db
    .select()
    .from(prompts)
    .where(eq(prompts.id, id))
    .limit(1);
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

    // No-op guard: if the patch doesn't change anything, don't write a redundant
    // version snapshot or bump currentVersion (mirrors acceptUpdate's guard).
    const unchanged =
      merged.title === current.title &&
      merged.description === current.description &&
      merged.template === current.template &&
      tagsEqual(merged.tags, current.tags);
    if (unchanged) return current;

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

// ---------------------------------------------------------------------------
// Q2: forking + reconciling internal updates with customer edits
// ---------------------------------------------------------------------------

/**
 * Fork an internal prompt into a new customer-owned copy. The copy records which
 * source it came from and pins `syncedSourceVersion` to the source's current
 * version — the point in the source's history it is reconciled against.
 */
export async function forkPrompt(
  sourceId: string,
  overrides?: { title?: string },
): Promise<
  | { ok: true; prompt: Prompt }
  | { ok: false; reason: "not-found" | "not-internal" }
> {
  return db.transaction(async (tx) => {
    const [source] = await tx
      .select()
      .from(prompts)
      .where(eq(prompts.id, sourceId))
      .limit(1);
    if (!source) return { ok: false, reason: "not-found" };
    if (source.kind !== "internal")
      return { ok: false, reason: "not-internal" };

    const content: PromptContent = {
      ...toContent(source),
      title: overrides?.title ?? source.title,
    };
    const [prompt] = await tx
      .insert(prompts)
      .values({
        kind: "custom",
        sourcePromptId: source.id,
        syncedSourceVersion: source.currentVersion,
        title: content.title,
        description: content.description,
        template: content.template,
        tags: content.tags,
        currentVersion: 1,
      })
      .returning();
    // Record the fork point in the copy's own history, marked `internal` for provenance
    await snapshot(tx, prompt.id, 1, content, "internal");
    return { ok: true, prompt };
  });
}

const NO_SOURCE_STATUS: Omit<UpdateStatus, "syncedVersion"> = {
  hasSource: false,
  sourcePromptId: null,
  updateAvailable: false,
  hasLocalChanges: false,
  sourceVersion: null,
  merge: null,
};

/** Compute the reconciliation status + merge preview for a prompt. */
export async function getUpdateStatus(
  id: string,
): Promise<UpdateStatus | undefined> {
  const custom = await getPromptById(id);
  if (!custom) return undefined;

  if (custom.kind !== "custom" || !custom.sourcePromptId) {
    return {
      ...NO_SOURCE_STATUS,
      syncedVersion: custom.syncedSourceVersion ?? null,
    };
  }
  const source = await getPromptById(custom.sourcePromptId);
  if (!source) {
    return {
      ...NO_SOURCE_STATUS,
      syncedVersion: custom.syncedSourceVersion ?? null,
    };
  }

  const synced = custom.syncedSourceVersion ?? 0;
  const base =
    (await getVersionContent(db, source.id, synced)) ?? toContent(source);
  const customerContent = toContent(custom);
  const merge = mergePrompt(base, customerContent, toContent(source));

  const hasLocalChanges =
    base.title !== customerContent.title ||
    base.description !== customerContent.description ||
    base.template !== customerContent.template ||
    !tagsEqual(base.tags, customerContent.tags);

  return {
    hasSource: true,
    sourcePromptId: source.id,
    updateAvailable: source.currentVersion > synced,
    hasLocalChanges,
    sourceVersion: source.currentVersion,
    syncedVersion: synced,
    merge,
  };
}

type ReconcileResult =
  | { ok: true; prompt: Prompt }
  | { ok: false; reason: "not-found" | "no-source" | "no-update" };

/**
 * Accept the internal update: persist the field-level merge (auto-merged fields +
 * the customer's picks for conflicts) and advance `syncedSourceVersion`. Writes a
 * new snapshot marking the sync point.
 */
export async function acceptUpdate(
  id: string,
  picks: ConflictPicks,
): Promise<ReconcileResult> {
  return db.transaction(async (tx) => {
    const [custom] = await tx
      .select()
      .from(prompts)
      .where(eq(prompts.id, id))
      .limit(1)
      .for("update");
    if (!custom) return { ok: false, reason: "not-found" };
    if (custom.kind !== "custom" || !custom.sourcePromptId) {
      return { ok: false, reason: "no-source" };
    }
    const [source] = await tx
      .select()
      .from(prompts)
      .where(eq(prompts.id, custom.sourcePromptId))
      .limit(1);
    if (!source) return { ok: false, reason: "no-source" };

    const synced = custom.syncedSourceVersion ?? 0;
    if (source.currentVersion <= synced)
      return { ok: false, reason: "no-update" };

    const base =
      (await getVersionContent(tx, source.id, synced)) ?? toContent(source);
    const merge = mergePrompt(base, toContent(custom), toContent(source));

    if (!merge.hasChanges) {
      // The source advanced but its changes net to nothing the customer would
      // adopt (e.g. an edit was reverted, or the customer already made the same
      // change). Acknowledge the sync without a redundant snapshot / version bump.
      const [updated] = await tx
        .update(prompts)
        .set({ syncedSourceVersion: source.currentVersion })
        .where(eq(prompts.id, id))
        .returning();
      return { ok: true, prompt: updated };
    }

    const merged = buildMergedContent(merge, picks);
    const nextVersion = custom.currentVersion + 1;

    const [updated] = await tx
      .update(prompts)
      .set({
        ...merged,
        currentVersion: nextVersion,
        syncedSourceVersion: source.currentVersion,
        updatedAt: new Date(),
      })
      .where(eq(prompts.id, id))
      .returning();
    await snapshot(tx, id, nextVersion, merged, "internal");
    return { ok: true, prompt: updated };
  });
}

/**
 * Dismiss the internal update ("keep mine"): advance `syncedSourceVersion` without
 * changing content, so the banner clears until the source publishes again. No new
 * snapshot — the content is unchanged.
 */
export async function dismissUpdate(id: string): Promise<ReconcileResult> {
  return db.transaction(async (tx) => {
    const [custom] = await tx
      .select()
      .from(prompts)
      .where(eq(prompts.id, id))
      .limit(1)
      .for("update");
    if (!custom) return { ok: false, reason: "not-found" };
    if (custom.kind !== "custom" || !custom.sourcePromptId) {
      return { ok: false, reason: "no-source" };
    }
    const [source] = await tx
      .select()
      .from(prompts)
      .where(eq(prompts.id, custom.sourcePromptId))
      .limit(1);
    if (!source) return { ok: false, reason: "no-source" };

    const synced = custom.syncedSourceVersion ?? 0;
    if (source.currentVersion <= synced)
      return { ok: false, reason: "no-update" };

    const [updated] = await tx
      .update(prompts)
      .set({ syncedSourceVersion: source.currentVersion })
      .where(eq(prompts.id, id))
      .returning();
    return { ok: true, prompt: updated };
  });
}
