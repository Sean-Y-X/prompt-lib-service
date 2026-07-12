/**
 * Field-level 3-way merge for reconciling internal prompt updates with customer
 * edits. We merge at the granularity of a prompt's four fields (not line-by-line
 * within the template) — a prompt template is a small cohesive block where
 * line-level merges tend to produce broken text, so whole-field resolution is
 * both cheaper and more correct. See plan.md for the full rationale.
 */

export interface PromptContent {
  title: string;
  description: string;
  template: string;
  tags: string[];
}

/** The three scalar fields that can genuinely conflict. */
export type ScalarField = "title" | "description" | "template";

export type ScalarStatus =
  // customer and internal agree (either neither changed, or both made the same edit)
  | "unchanged"
  // only the customer changed it — keep theirs, nothing to adopt
  | "customer"
  // only internal changed it — a free improvement to adopt
  | "internal"
  // both changed it to different values — the customer must choose
  | "conflict";

export interface ScalarMerge {
  status: ScalarStatus;
  base: string;
  customer: string;
  internal: string;
  /** Resolved value for non-conflict statuses; `undefined` until the user picks. */
  value?: string;
}

export interface TagMerge {
  base: string[];
  customer: string[];
  internal: string[];
  /** Always resolvable — sets don't have the "two values, one slot" problem. */
  value: string[];
  /** Tags the merge adds relative to the customer's current tags. */
  added: string[];
  /** Tags the merge removes relative to the customer's current tags. */
  removed: string[];
}

export interface PromptMerge {
  title: ScalarMerge;
  description: ScalarMerge;
  template: ScalarMerge;
  tags: TagMerge;
  /** At least one scalar field needs a manual choice. */
  hasConflicts: boolean;
  /** The merge would change the customer's current content in some way. */
  hasChanges: boolean;
}

function mergeScalar(
  base: string,
  customer: string,
  internal: string,
): ScalarMerge {
  if (customer === internal) {
    return { status: "unchanged", base, customer, internal, value: customer };
  }
  if (customer === base) {
    // Customer never touched it; internal did → adopt internal's improvement.
    return { status: "internal", base, customer, internal, value: internal };
  }
  if (internal === base) {
    // Internal didn't touch it; customer did → keep the customer's edit.
    return { status: "customer", base, customer, internal, value: customer };
  }
  return { status: "conflict", base, customer, internal };
}

/**
 * Symmetric 3-way set merge:
 *   merged = (base ∩ customer ∩ internal) ∪ (customer − base) ∪ (internal − base)
 * A base tag survives only if neither side removed it; any tag either side newly
 * added is included. This deliberately avoids a naive `customer ∪ internal`, which
 * would resurrect a tag the customer explicitly removed.
 */
function mergeTags(
  base: string[],
  customer: string[],
  internal: string[],
): TagMerge {
  const baseSet = new Set(base);
  const customerSet = new Set(customer);
  const internalSet = new Set(internal);

  const kept = base.filter((t) => customerSet.has(t) && internalSet.has(t));
  const customerAdded = customer.filter((t) => !baseSet.has(t));
  const internalAdded = internal.filter((t) => !baseSet.has(t));

  const value = [...new Set([...kept, ...customerAdded, ...internalAdded])];

  const valueSet = new Set(value);
  const added = value.filter((t) => !customerSet.has(t));
  const removed = customer.filter((t) => !valueSet.has(t));

  return { base, customer, internal, value, added, removed };
}

export function mergePrompt(
  base: PromptContent,
  customer: PromptContent,
  internal: PromptContent,
): PromptMerge {
  const title = mergeScalar(base.title, customer.title, internal.title);
  const description = mergeScalar(
    base.description,
    customer.description,
    internal.description,
  );
  const template = mergeScalar(
    base.template,
    customer.template,
    internal.template,
  );
  const tags = mergeTags(base.tags, customer.tags, internal.tags);

  const scalars = [title, description, template];
  const hasConflicts = scalars.some((s) => s.status === "conflict");
  const hasChanges =
    scalars.some((s) => s.status === "internal" || s.status === "conflict") ||
    tags.added.length > 0 ||
    tags.removed.length > 0;

  return { title, description, template, tags, hasConflicts, hasChanges };
}

/** How the customer resolved each conflicting scalar field. */
export type ConflictPicks = Partial<
  Record<ScalarField, "customer" | "internal">
>;

/**
 * Produce the final content to persist after a merge. Non-conflicting fields use
 * their auto-resolved value; conflicting fields use the customer's pick, defaulting
 * to "customer" (keep mine) when unspecified — the safe, no-data-loss default.
 */
export function buildMergedContent(
  merge: PromptMerge,
  picks: ConflictPicks = {},
): PromptContent {
  const resolveScalar = (field: ScalarField, m: ScalarMerge): string => {
    if (m.status !== "conflict") return m.value ?? m.customer;
    return picks[field] === "internal" ? m.internal : m.customer;
  };

  return {
    title: resolveScalar("title", merge.title),
    description: resolveScalar("description", merge.description),
    template: resolveScalar("template", merge.template),
    tags: merge.tags.value,
  };
}
