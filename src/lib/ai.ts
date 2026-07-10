import { google } from "@ai-sdk/google";
import { generateText, Output } from "ai";
import { z } from "zod";

/**
 * AI-assisted prompt drafting. The provider sits behind the Vercel AI SDK so it
 * can be swapped with a one-line change (`@ai-sdk/google` → `@ai-sdk/groq`, etc.).
 * We use `generateText` + `Output.object` (the current AI SDK API; `generateObject`
 * is deprecated) to get a schema-validated object back rather than parsing free text.
 *
 * The Google provider reads GOOGLE_GENERATIVE_AI_API_KEY from the environment.
 */

const MODEL = "gemini-3.1-flash-lite";

const draftSchema = z.object({
  title: z.string().describe("A short, descriptive name for the prompt"),
  description: z
    .string()
    .describe("One sentence explaining what the prompt is for"),
  template: z
    .string()
    .describe(
      "The reusable prompt text. Use {{variableName}} placeholders for any input that should be filled in at render time, e.g. 'Classify this ticket: {{ticket}}'.",
    ),
  tags: z
    .array(z.string())
    .describe("2-5 short lowercase topical tags for search and grouping"),
});

export type PromptDraft = z.infer<typeof draftSchema>;

/**
 * Turn a free-text brief into a structured prompt draft. The result is meant to be
 * reviewed and edited by the user before saving — never persisted directly.
 */
export async function draftPromptFromBrief(brief: string): Promise<PromptDraft> {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    throw new Error(
      "GOOGLE_GENERATIVE_AI_API_KEY is not set — AI drafting is unavailable.",
    );
  }

  const { output } = await generateText({
    model: google(MODEL),
    output: Output.object({ schema: draftSchema }),
    system:
      "You are an expert prompt engineer helping build a reusable prompt library. " +
      "Given a short brief, produce one clear, reusable prompt template. " +
      "Extract anything that varies per use into {{variable}} placeholders. " +
      "Keep the template focused and free of commentary.",
    prompt: brief,
  });

  return output;
}
