/**
 * Seed script — populates a fresh database with a demo library and, crucially, a
 * live Q2 reconciliation scenario so the merge UI has something to show on first
 * load. Idempotent: it clears existing data first.
 *
 * Run with: `bun run db:seed`
 */

import { db } from "./index";
import {
  createPrompt,
  forkPrompt,
  recordRender,
  updatePrompt,
} from "./queries";
import { prompts } from "./schema";

async function seed() {
  console.log("Clearing existing data…");
  await db.delete(prompts);

  console.log("Creating standalone prompts (for search / render demos)…");
  const summarizer = await createPrompt({
    kind: "custom",
    content: {
      title: "Meeting Notes Summarizer",
      description: "Turns raw meeting notes into decisions and action items.",
      template:
        "Summarize the following meeting notes into two sections — Decisions and Action Items (with owners):\n\n{{notes}}",
      tags: ["productivity", "summarization"],
    },
  });

  await createPrompt({
    kind: "custom",
    content: {
      title: "SQL Query Explainer",
      description: "Explains what a SQL query does in plain English.",
      template:
        "Explain, step by step, what this SQL query does and flag any performance concerns:\n\n{{query}}",
      tags: ["sql", "engineering", "explain"],
    },
  });

  await createPrompt({
    kind: "internal",
    content: {
      title: "PII Redactor",
      description: "Redacts personally identifiable information from text.",
      template:
        "Redact all personally identifiable information (names, emails, phone numbers, addresses) from the text below, replacing each with a [REDACTED] tag:\n\n{{text}}",
      tags: ["safety", "privacy", "redaction"],
    },
  });

  // Give one prompt some usage history so stats aren't all zero.
  await recordRender(summarizer.id);
  await recordRender(summarizer.id);
  await recordRender(summarizer.id);

  console.log("Setting up the Q2 reconciliation scenario…");

  // 1. Internal team publishes a prompt (v1).
  const internal = await createPrompt({
    kind: "internal",
    content: {
      title: "Customer Support Classifier",
      description: "Classifies support tickets.",
      template: "Classify this ticket: {{ticket}}",
      tags: ["support", "classification"],
    },
  });

  // 2. A customer adopts it (forks — synced at v1).
  const forkResult = await forkPrompt(internal.id);
  if (!forkResult.ok) throw new Error(`Fork failed: ${forkResult.reason}`);
  const copy = forkResult.prompt;

  // 3. The customer edits their copy: reworks the template and adds a tag.
  await updatePrompt(copy.id, {
    template:
      "Please classify this support ticket and suggest a priority level: {{ticket}}",
    tags: ["support", "classification", "priority"],
  });

  // 4. The internal team publishes an update (v2): improves the description
  //    (a field the customer didn't touch → will auto-adopt) AND rewrites the
  //    template differently (a field the customer DID touch → a real conflict).
  await updatePrompt(internal.id, {
    description: "Classifies support tickets by category and urgency.",
    template:
      "You are a support classifier. Categorize this ticket: {{ticket}}",
  });

  console.log("\nSeed complete. The demo now contains:");
  console.log("  • 3 standalone prompts (search, tags, render)");
  console.log(
    "  • 'Customer Support Classifier' (internal, v2) — try Fork / editing to publish updates",
  );
  console.log(
    "  • A forked customer copy with a PENDING update: description auto-adopts,",
  );
  console.log("    template is a conflict → open it to walk the merge dialog.");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
