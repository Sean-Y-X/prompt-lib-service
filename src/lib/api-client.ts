import type {
  Prompt,
  PromptContent,
  PromptKind,
  PromptListItem,
  RenderResult,
  UpdateStatus,
} from "./types";

/** Draft returned by the AI-assist endpoint (not yet persisted). */
export type PromptDraft = PromptContent;

export type ConflictResolutions = Partial<
  Record<"title" | "description" | "template", "customer" | "internal">
>;

/** Thrown for any non-2xx response, carrying the server's error message + status. */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function http<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // non-JSON error body — keep the generic message
    }
    throw new ApiError(message, res.status);
  }
  // 204/empty guard, though our routes always return a JSON body on success.
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export interface ListParams {
  q?: string;
  kind?: PromptKind;
}

export const api = {
  list: ({ q, kind }: ListParams): Promise<PromptListItem[]> => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (kind) params.set("kind", kind);
    const qs = params.toString();
    return http<PromptListItem[]>(`/api/prompts${qs ? `?${qs}` : ""}`);
  },

  get: (id: string): Promise<Prompt> => http<Prompt>(`/api/prompts/${id}`),

  create: (body: {
    kind: PromptKind;
    content: PromptContent;
  }): Promise<Prompt> =>
    http<Prompt>("/api/prompts", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  update: (id: string, patch: Partial<PromptContent>): Promise<Prompt> =>
    http<Prompt>(`/api/prompts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  render: (
    id: string,
    variables: Record<string, string>,
  ): Promise<RenderResult> =>
    http<RenderResult>(`/api/prompts/${id}/render`, {
      method: "POST",
      body: JSON.stringify({ variables }),
    }),

  draft: (brief: string): Promise<PromptDraft> =>
    http<PromptDraft>("/api/prompts/draft", {
      method: "POST",
      body: JSON.stringify({ brief }),
    }),

  fork: (id: string, body: { title?: string } = {}): Promise<Prompt> =>
    http<Prompt>(`/api/prompts/${id}/fork`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  updates: (id: string): Promise<UpdateStatus> =>
    http<UpdateStatus>(`/api/prompts/${id}/updates`),

  acceptUpdate: (
    id: string,
    resolutions: ConflictResolutions,
    // The source version the merge preview was computed against; the server
    // 409s if the source has published again since (stale preview).
    expectedSourceVersion?: number,
  ): Promise<Prompt> =>
    http<Prompt>(`/api/prompts/${id}/updates/accept`, {
      method: "POST",
      body: JSON.stringify({ resolutions, expectedSourceVersion }),
    }),

  dismissUpdate: (id: string): Promise<Prompt> =>
    http<Prompt>(`/api/prompts/${id}/updates/dismiss`, { method: "POST" }),
};
