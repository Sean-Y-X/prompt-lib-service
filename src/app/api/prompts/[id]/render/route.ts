import { NextResponse } from "next/server";
import { recordRender } from "@/db/queries";
import { notFound, parseBody } from "@/lib/http";
import { renderSchema } from "@/lib/schemas";
import { renderTemplate } from "@/lib/render-template";

// POST /api/prompts/:id/render — substitute {{variables}} and track usage.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = await parseBody(req, renderSchema);
  if ("error" in parsed) return parsed.error;

  const prompt = await recordRender(id);
  if (!prompt) return notFound("Prompt not found");

  const { output, missing } = renderTemplate(
    prompt.template,
    parsed.data.variables,
  );

  return NextResponse.json({
    output,
    missing,
    renderCount: prompt.renderCount,
    lastRenderedAt: prompt.lastRenderedAt,
  });
}
