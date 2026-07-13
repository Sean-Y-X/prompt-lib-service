"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import type { Prompt, PromptContent } from "@/lib/types";

/** Create a prompt. Invalidates the list so it appears immediately. */
export function useCreatePrompt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      kind: "internal" | "custom";
      content: PromptContent;
    }) => api.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prompts"] });
    },
  });
}

/**
 * Update a prompt. Refreshes both the detail view and the list, plus this prompt's
 * update-status (editing an internal prompt publishes a new version, which can make
 * updates available to its customer copies).
 */
export function useUpdatePrompt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<PromptContent>;
    }) => api.update(id, patch),
    onSuccess: (updated) => {
      // The PATCH response is authoritative — seed the detail cache directly
      // rather than invalidating it (which would refetch and discard this).
      qc.setQueryData(queryKeys.prompt(updated.id), updated);
      qc.invalidateQueries({ queryKey: ["prompts"] });
      // Editing an internal prompt publishes a version, changing update
      // availability for its customer copies; editing a copy changes its own
      // local-change status. Refresh all update-status queries.
      qc.invalidateQueries({ queryKey: ["updates"] });
    },
  });
}

/** Render a prompt; writes back the refreshed usage counters to the detail cache. */
export function useRenderPrompt(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (variables: Record<string, string>) =>
      api.render(id, variables),
    onSuccess: (result) => {
      qc.setQueryData<Prompt>(queryKeys.prompt(id), (prev) =>
        prev
          ? {
              ...prev,
              renderCount: result.renderCount,
              lastRenderedAt: result.lastRenderedAt,
            }
          : prev,
      );
      // Keep the library cards' render count / last-used in sync (marks the
      // list stale; refetches when it's next viewed).
      qc.invalidateQueries({ queryKey: ["prompts"] });
    },
  });
}

/** AI-draft a prompt from a brief. Not cached — a one-shot generation. */
export function useDraftPrompt() {
  return useMutation({
    mutationFn: (brief: string) => api.draft(brief),
  });
}
