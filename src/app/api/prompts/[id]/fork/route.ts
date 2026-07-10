import { NextResponse } from "next/server";
import { forkPrompt } from "@/db/queries";
import { jsonError, notFound, parseBody } from "@/lib/http";
import { forkSchema } from "@/lib/schemas";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/prompts/:id/fork — adopt an internal prompt into a new customer copy.
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const parsed = await parseBody(req, forkSchema);
  if ("error" in parsed) return parsed.error;

  const result = await forkPrompt(id, parsed.data);
  if (!result.ok) {
    if (result.reason === "not-found") return notFound("Prompt not found");
    return jsonError("Only internal prompts can be forked", 400);
  }
  return NextResponse.json(result.prompt, { status: 201 });
}
