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

  const redactor = await createPrompt({
    kind: "internal",
    content: {
      title: "PII Redactor",
      description: "Redacts personally identifiable information from text.",
      template:
        "Redact all personally identifiable information (names, emails, phone numbers, addresses) from the text below, replacing each with a [REDACTED] tag:\n\n{{text}}",
      tags: ["safety", "privacy", "redaction"],
    },
  });

  const sentiment = await createPrompt({
    kind: "internal",
    content: {
      title: "Sentiment Analyzer",
      description:
        "Labels text as positive, negative, or neutral with a confidence score.",
      template:
        "Analyze the sentiment of the following text. Respond with a label (positive / negative / neutral), a confidence score from 0 to 1, and a one-sentence justification:\n\n{{text}}",
      tags: ["analysis", "sentiment", "classification"],
    },
  });

  const toneRewriter = await createPrompt({
    kind: "internal",
    content: {
      title: "Email Tone Rewriter",
      description: "Rewrites an email draft in a requested tone.",
      template:
        "Rewrite the email below in a {{tone}} tone. Preserve all facts, names, and requests — only change the phrasing:\n\n{{email}}",
      tags: ["writing", "email", "tone"],
    },
  });

  const codeReview = await createPrompt({
    kind: "internal",
    content: {
      title: "Code Review Assistant",
      description:
        "Reviews a code diff for bugs, style issues, and missing tests.",
      template:
        "Review the following diff. List correctness bugs first, then style issues, then any missing test coverage. Reference line numbers where possible:\n\n{{diff}}",
      tags: ["engineering", "code-review", "quality"],
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

  console.log("Setting up additional pending-update scenarios…");

  // Clean fast-forward: a customer forks the PII Redactor and never touches it,
  // then the internal team publishes v2. Every changed field auto-adopts — no
  // conflicts, just an "update available" badge.
  const redactorForkResult = await forkPrompt(redactor.id);
  if (!redactorForkResult.ok)
    throw new Error(`Fork failed: ${redactorForkResult.reason}`);
  await updatePrompt(redactor.id, {
    template:
      "Redact all personally identifiable information (names, emails, phone numbers, addresses, SSNs, credit card numbers) from the text below, replacing each with a [REDACTED:<type>] tag:\n\n{{text}}",
    tags: ["safety", "privacy", "redaction", "compliance"],
  });

  // Non-overlapping edits: the customer edits one field (tags), the internal
  // team edits different fields (description + template). The update applies
  // cleanly on top of the customer's changes — local edits, but no conflict.
  const reviewForkResult = await forkPrompt(codeReview.id);
  if (!reviewForkResult.ok)
    throw new Error(`Fork failed: ${reviewForkResult.reason}`);
  await updatePrompt(reviewForkResult.prompt.id, {
    tags: ["engineering", "code-review", "quality", "backend-team"],
  });
  await updatePrompt(codeReview.id, {
    description:
      "Reviews a code diff for bugs, security issues, style problems, and missing tests.",
    template:
      "Review the following diff. List correctness bugs first, then security concerns, then style issues, then any missing test coverage. Reference line numbers where possible:\n\n{{diff}}",
  });

  // Full conflict: both sides edited every content field (description, tags,
  // AND template) since the fork point → the merge dialog shows a conflict on
  // all three at once.
  const triager = await createPrompt({
    kind: "internal",
    content: {
      title: "Bug Report Triager",
      description: "Triages incoming bug reports.",
      template: "Triage this bug report and assign a severity:\n\n{{report}}",
      tags: ["engineering", "triage"],
    },
  });
  const triagerForkResult = await forkPrompt(triager.id);
  if (!triagerForkResult.ok)
    throw new Error(`Fork failed: ${triagerForkResult.reason}`);
  await updatePrompt(triagerForkResult.prompt.id, {
    description: "Triages bug reports for the mobile team's backlog.",
    template:
      "Triage this bug report: assign a severity and route it to the right mobile squad:\n\n{{report}}",
    tags: ["engineering", "triage", "mobile"],
  });
  await updatePrompt(triager.id, {
    description:
      "Triages incoming bug reports by severity, component, and reproducibility.",
    template:
      "You are a bug triager. For the report below, determine severity (P0–P3), affected component, and whether it is reproducible:\n\n{{report}}",
    tags: ["engineering", "triage", "quality"],
  });

  // Tags conflict: both sides edited the tag list since the fork point. The
  // customer added their own tag while the internal team reworked the taxonomy,
  // so the tags field needs a manual merge decision.
  const sentimentForkResult = await forkPrompt(sentiment.id);
  if (!sentimentForkResult.ok)
    throw new Error(`Fork failed: ${sentimentForkResult.reason}`);
  await updatePrompt(sentimentForkResult.prompt.id, {
    tags: ["analysis", "sentiment", "classification", "voice-of-customer"],
  });
  await updatePrompt(sentiment.id, {
    tags: ["nlp", "sentiment", "classification"],
  });

  // Description conflict: both sides rewrote the description since the fork
  // point → the description field needs a manual merge decision.
  const toneForkResult = await forkPrompt(toneRewriter.id);
  if (!toneForkResult.ok)
    throw new Error(`Fork failed: ${toneForkResult.reason}`);
  await updatePrompt(toneForkResult.prompt.id, {
    description:
      "Rewrites outbound customer emails in our house style and tone.",
  });
  await updatePrompt(toneRewriter.id, {
    description:
      "Rewrites an email draft in a requested tone without altering its meaning.",
  });

  console.log("\nSeed complete. The demo now contains:");
  console.log("  • 6 standalone prompts (search, tags, render)");
  console.log(
    "  • 'Customer Support Classifier' (internal, v2) — try Fork / editing to publish updates",
  );
  console.log(
    "  • A forked customer copy with a PENDING update: description auto-adopts,",
  );
  console.log("    template is a conflict → open it to walk the merge dialog.");
  console.log(
    "  • A forked 'PII Redactor' with a pending update and no local edits (clean fast-forward).",
  );
  console.log(
    "  • A forked 'Code Review Assistant' with local edits that don't overlap the update (clean merge).",
  );
  console.log(
    "  • A forked 'Sentiment Analyzer' where both sides changed tags → tags conflict.",
  );
  console.log(
    "  • A forked 'Email Tone Rewriter' where both sides changed the description → description conflict.",
  );
  console.log(
    "  • A forked 'Bug Report Triager' where both sides changed description, tags, AND template → all-fields conflict.",
  );
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
