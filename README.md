# Prompt Library Service

A small full-stack service for managing, discovering, rendering, and **reconciling** prompts.

Built for a take-home exercise in two parts:

1. **Prompt Library** — create prompts (manually or with AI), search them, render templates with `{{variable}}` substitution, and track usage.
2. **Managing Prompt Updates** — when a customer forks an internal prompt and both sides make changes over time, help the customer adopt internal improvements **without losing their own edits**, via a field-level 3-way merge.

> **Design decisions, trade-offs, and problem analysis are documented separately in [DESIGN.md](./DESIGN.md).**

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router) · React 19 · TypeScript |
| Styling / UI | Tailwind CSS v4 · shadcn/ui (Base UI primitives) |
| Data fetching | TanStack Query |
| API | Next.js Route Handlers (REST-shaped) · zod validation |
| ORM / DB | Drizzle ORM · Neon serverless Postgres |
| AI | Google Gemini via the Vercel AI SDK (`ai` + `@ai-sdk/google`) |
| Tooling | bun · Biome (lint/format) |

## Prerequisites

- [bun](https://bun.sh) (package manager + runtime)
- A [Neon](https://neon.tech) Postgres database (free tier is fine) — or any Postgres connection string
- (Optional) A [Google AI Studio](https://aistudio.google.com/apikey) API key for the "Draft with AI" feature. Everything else works without it.

## Setup

```bash
# 1. Install dependencies
bun install

# 2. Configure environment
cp .env.example .env.local
#   then edit .env.local and set:
#     DATABASE_URL="postgresql://…"                  (required)
#     GOOGLE_GENERATIVE_AI_API_KEY="…"               (optional, for AI drafting)

# 3. Create the schema
bun run db:migrate

# 4. Seed demo data (includes a live merge scenario — see below)
bun run db:seed

# 5. Run
bun run dev            # http://localhost:3000
```

### Scripts

| Script | Purpose |
|---|---|
| `bun run dev` | Start the dev server |
| `bun run build` / `bun run start` | Production build / serve |
| `bun run db:generate` | Generate a migration from schema changes |
| `bun run db:migrate` | Apply migrations |
| `bun run db:seed` | Reset + seed demo data |
| `bun run db:studio` | Open Drizzle Studio |
| `bun run lint` / `bun run format` | Biome check / format |

## Example scenarios

### Q1 — Library, search, render

1. Open `/` — the **library**. Use the search box (matches title, description, and tags) and the **All / Internal / Mine** filter.
2. Click **New Prompt** to create one manually, or toggle **Draft with AI**: type a brief (e.g. *"summarize a support call into 3 bullets and a sentiment"*) → Generate → review the drafted fields → Save.
3. Open a prompt → **Render** tab. Inputs are auto-generated from the template's `{{variables}}`. Fill them in and Render — the substituted output appears, unfilled variables are flagged, and the render count / last-used update.

Example prompt:

```json
{
  "title": "Customer Support Classifier",
  "description": "Classifies support tickets",
  "template": "Classify this ticket: {{ticket}}",
  "tags": ["support", "classification"]
}
```

Rendering with `{ "ticket": "I was charged twice." }` →

```
Classify this ticket: I was charged twice.
```

### Q2 — Reconciling an internal update (seeded)

The seed sets up a ready-to-walk scenario. After `bun run db:seed`:

1. In the library you'll see **"Customer Support Classifier"** twice — an **Internal** source (v2) and **Yours** (a forked copy) with an **update-available** marker.
2. Open the **Yours** copy → an **update banner** appears. Click **Review update**. The merge dialog shows:
   - **Description** → *Adopting update* (the internal team improved it; you never touched it, so it's applied automatically).
   - **Template** → *Conflict* (you both edited it) with a word-level diff and a **Keep mine / Take theirs** choice.
   - Tags are auto-merged.
3. Choose per-conflict, then **Accept update** (applies the merge) or **Keep mine** (acknowledge without changing your content). Either way the banner clears; it reappears only if the internal team publishes again.

To simulate the internal team **publishing another update**: open the Internal prompt → **Edit** → change the template → Save. The copy's banner returns.

To create your own copy from scratch: open any **Internal** prompt → **Use this prompt** (fork).

## API

REST endpoints (all under `/api/prompts`), usable directly via curl/Postman:

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/prompts?q=&kind=&tags=a,b` | Search by title/description/tags (`tags` filters to prompts sharing at least one); each row includes `updateAvailable` |
| `POST` | `/api/prompts` | Create (`{ kind, content }`) |
| `GET` | `/api/prompts/:id` | Get one |
| `PATCH` | `/api/prompts/:id` | Update (partial content; no-op edits don't create a version) |
| `POST` | `/api/prompts/:id/render` | Render (`{ variables }`) + track usage |
| `POST` | `/api/prompts/draft` | AI-draft from a brief (`{ brief }`) — not persisted |
| `POST` | `/api/prompts/:id/fork` | Fork an internal prompt into a customer copy |
| `GET` | `/api/prompts/:id/updates` | Reconciliation status + field-level merge preview |
| `POST` | `/api/prompts/:id/updates/accept` | Apply the merge (`{ resolutions, expectedSourceVersion? }`); 409 if the source published again since the preview |
| `POST` | `/api/prompts/:id/updates/dismiss` | "Keep mine" — acknowledge without changing content |

## Scope

Per the exercise: no authentication/authorization, single user assumed, prompts are plain text, no production-grade security or rate limiting. See [DESIGN.md](./DESIGN.md) for the reasoning behind these and other decisions.
