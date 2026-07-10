import { NextResponse } from "next/server";
import { createPrompt, searchPrompts } from "@/db/queries";
import { parseBody } from "@/lib/http";
import { createPromptSchema } from "@/lib/schemas";

// GET /api/prompts?q=&tags=a,b&kind=custom — search by title/description/tags.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() || undefined;
  const tags =
    searchParams
      .get("tags")
      ?.split(",")
      .map((t) => t.trim())
      .filter(Boolean) || undefined;
  const kindParam = searchParams.get("kind");
  const kind =
    kindParam === "internal" || kindParam === "custom" ? kindParam : undefined;

  const results = await searchPrompts({ q, tags, kind });
  return NextResponse.json(results);
}

// POST /api/prompts — create a prompt from the four content fields.
export async function POST(req: Request) {
  const parsed = await parseBody(req, createPromptSchema);
  if ("error" in parsed) return parsed.error;

  const prompt = await createPrompt(parsed.data);
  return NextResponse.json(prompt, { status: 201 });
}
