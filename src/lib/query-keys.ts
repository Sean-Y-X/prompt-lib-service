import type { ListParams } from "./api-client";

/** Central query-key factory so invalidation stays consistent across hooks. */
export const queryKeys = {
  prompts: (params: ListParams = {}) => ["prompts", params] as const,
  prompt: (id: string) => ["prompt", id] as const,
  // Own namespace (not nested under "prompt") so a detail-cache write isn't
  // clobbered when we invalidate update-status across prompts after an edit.
  updates: (id: string) => ["updates", id] as const,
};
