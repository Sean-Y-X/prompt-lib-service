"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api, type ListParams } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

/**
 * Search/list prompts. `keepPreviousData` keeps the last results on screen while a
 * new query resolves, which (with TanStack Query's built-in request dedping) is what
 * makes search-as-you-type feel smooth and avoids stale-response flicker.
 */
export function usePrompts(params: ListParams) {
  return useQuery({
    queryKey: queryKeys.prompts(params),
    queryFn: () => api.list(params),
    placeholderData: keepPreviousData,
  });
}

/** Fetch a single prompt. */
export function usePrompt(id: string) {
  return useQuery({
    queryKey: queryKeys.prompt(id),
    queryFn: () => api.get(id),
    enabled: Boolean(id),
  });
}
