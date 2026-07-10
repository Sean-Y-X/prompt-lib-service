import { NextResponse } from "next/server";
import { getPromptById, updatePrompt } from "@/db/queries";
import { notFound, parseBody } from "@/lib/http";
import { updatePromptSchema } from "@/lib/schemas";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/prompts/:id
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const prompt = await getPromptById(id);
  if (!prompt) return notFound("Prompt not found");
  return NextResponse.json(prompt);
}

// PATCH /api/prompts/:id — partial content edit. Editing an `internal` prompt is
// how the internal team "publishes an update"; editing a `custom` prompt is a
// customer edit. Both append a version snapshot (handled in updatePrompt).
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const parsed = await parseBody(req, updatePromptSchema);
  if ("error" in parsed) return parsed.error;

  const updated = await updatePrompt(id, parsed.data);
  if (!updated) return notFound("Prompt not found");
  return NextResponse.json(updated);
}
