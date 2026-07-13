import { NextResponse } from "next/server";
import { AiDraftError, draftPromptFromBrief } from "@/lib/ai";
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
    // Only AiDraftError messages are meant for the client; raw provider/SDK
    // errors are logged here and reported generically so internals don't leak.
    console.error("AI drafting failed:", err);
    const message =
      err instanceof AiDraftError
        ? err.message
        : "AI drafting failed — please try again.";
    // 503: the feature is optional and depends on an external provider/key.
    return jsonError(message, 503);
  }
}
