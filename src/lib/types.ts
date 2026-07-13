import type { PromptMerge } from "./merge";

/**
 * Client-facing shapes — the contract the API returns over JSON. These mirror the
 * DB row types but with `Date` columns as ISO strings (JSON has no Date), so the
 * client never pretends to hold a real Date it doesn't have.
 */

export type PromptKind = "internal" | "custom";

export interface Prompt {
  id: string;
  kind: PromptKind;
  sourcePromptId: string | null;
  syncedSourceVersion: number | null;
  title: string;
  description: string;
  template: string;
  tags: string[];
  currentVersion: number;
  renderCount: number;
  lastRenderedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** The four editable content fields. */
export interface PromptContent {
  title: string;
  description: string;
  template: string;
  tags: string[];
}

export interface RenderResult {
  output: string;
  missing: string[];
  renderCount: number;
  lastRenderedAt: string;
}

/**
 * A prompt as returned by the list/search endpoint. Carries a computed
 * `updateAvailable` (whether its internal source has advanced). The single-prompt GET returns a plain
 * `Prompt` — update details for one prompt come from the `/updates` endpoint.
 */
export interface PromptListItem extends Prompt {
  updateAvailable: boolean;
}

/** Reconciliation status + field-level merge preview for a customer copy. */
export interface UpdateStatus {
  hasSource: boolean;
  sourcePromptId: string | null;
  updateAvailable: boolean;
  hasLocalChanges: boolean;
  sourceVersion: number | null;
  syncedVersion: number | null;
  merge: PromptMerge | null;
}
