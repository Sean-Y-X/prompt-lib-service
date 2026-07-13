"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type ConflictResolutions } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import type { Prompt } from "@/lib/types";

/** Reconciliation status + field-level merge preview for a prompt. */
export function usePromptUpdates(id: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.updates(id),
    queryFn: () => api.updates(id),
    enabled: enabled && Boolean(id),
  });
}

/** Fork an internal prompt into a new customer copy. */
export function useForkPrompt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title?: string }) =>
      api.fork(id, { title }),
    onSuccess: (created) => {
      // Prime the new copy's detail cache so navigating to it is instant
      // (no skeleton flash before the first fetch).
      qc.setQueryData(queryKeys.prompt(created.id), created);
      qc.invalidateQueries({ queryKey: ["prompts"] });
    },
  });
}

function useReconcile(
  id: string,
  action: (r: ConflictResolutions) => Promise<Prompt>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: action,
    onSuccess: (updated) => {
      qc.setQueryData(queryKeys.prompt(id), updated);
      qc.invalidateQueries({ queryKey: queryKeys.updates(id) });
      qc.invalidateQueries({ queryKey: ["prompts"] });
    },
  });
}

/** Accept the internal update, applying conflict resolutions. */
export function useAcceptUpdate(id: string) {
  return useReconcile(id, (resolutions) => api.acceptUpdate(id, resolutions));
}

/** Dismiss the internal update ("keep mine"). */
export function useDismissUpdate(id: string) {
  return useReconcile(id, () => api.dismissUpdate(id));
}
