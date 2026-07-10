import { NextResponse } from "next/server";
import { draftPromptFromBrief } from "@/lib/ai";
import { jsonError, parseBody } from "@/lib/http";
import { draftSchema } from "@/lib/schemas";

// POST /api/prompts/draft — AI-draft a prompt from a free-text brief. Returns the
// draft for the user to review/edit before creating; nothing is persisted here.
export async function POST(req: Request) {
  const parsed = await parseBody(req, draftSchema);
  if ("error" in parsed) return parsed.error;

  try {
    const draft = await draftPromptFromBrief(parsed.data.brief);
    return NextResponse.json(draft);
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI drafting failed";
    // 503: the feature is optional and depends on an external provider/key.
    return jsonError(message, 503);
  }
}
