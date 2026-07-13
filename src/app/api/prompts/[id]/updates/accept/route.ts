import { NextResponse } from "next/server";
import { acceptUpdate } from "@/db/queries";
import { jsonError, notFound, parseBody } from "@/lib/http";
import { acceptUpdateSchema } from "@/lib/schemas";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/prompts/:id/updates/accept — apply the merge (auto-merged fields plus
// the customer's picks for any conflicting fields) and advance the synced version.
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const parsed = await parseBody(req, acceptUpdateSchema);
  if ("error" in parsed) return parsed.error;

  const result = await acceptUpdate(
    id,
    parsed.data.resolutions,
    parsed.data.expectedSourceVersion,
  );
  if (!result.ok) {
    if (result.reason === "not-found") return notFound("Prompt not found");
    if (result.reason === "no-source") {
      return jsonError("Prompt has no internal source to update from", 400);
    }
    if (result.reason === "stale-preview") {
      return jsonError(
        "The internal source changed since you previewed this update — review the latest changes and try again",
        409,
      );
    }
    return jsonError("No update available", 409);
  }
  return NextResponse.json(result.prompt);
}
