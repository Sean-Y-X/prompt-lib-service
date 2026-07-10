import { NextResponse } from "next/server";
import { dismissUpdate } from "@/db/queries";
import { jsonError, notFound } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/prompts/:id/updates/dismiss — "keep mine": acknowledge the update
// without changing content, so the banner clears until the source publishes again.
export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const result = await dismissUpdate(id);
  if (!result.ok) {
    if (result.reason === "not-found") return notFound("Prompt not found");
    if (result.reason === "no-source") {
      return jsonError("Prompt has no internal source to update from", 400);
    }
    return jsonError("No update available", 409);
  }
  return NextResponse.json(result.prompt);
}
