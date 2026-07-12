# Prompt Library Service — Take-Home Plan

## Context

This is a take-home assignment (`TakeHomeTest.pdf`) with two parts:

- **Q1**: build a Prompt Library — CRUD, search (title/description/tags), template rendering with `{{variable}}` substitution, usage tracking (render count, last used).
- **Q2** (intentionally open-ended, weighted heavily in evaluation): prompts can originate from an internal source and receive updates over time, while customers independently edit their own copies. The system must let customers benefit from internal improvements **without unexpectedly losing their own changes** — ideally getting both at once, not forcing an either/or choice.

Repo is a fresh `create-next-app` scaffold (Next 15.5.20, React 19.1, Tailwind 4, TypeScript, **bun** as package manager, **biome** for lint/format — not eslint/prettier). No backend, DB, or app code exists yet.

Stack and design decisions below were reached through discussion and are treated as settled:

| Decision | Choice | Why |
|---|---|---|
| Database | Neon (serverless Postgres) | Drizzle is SQL-only; Postgres fits the relational versioning model in Q2; Neon = zero local setup, scale-to-zero, first-class Drizzle support, pairs natively with Vercel |
| ORM | Drizzle | Required by assignment |
| Deployment | Vercel + Neon, live demo link | Removes reviewer friction, standard modern pairing |
| Components | shadcn/ui (Base UI + Tailwind) | Fast, accessible, doesn't read as over-polished |
| Client data fetching | TanStack Query | Handles search-as-you-type race conditions and cross-view cache invalidation (mutation on one prompt must refresh both list and detail views) — meaningfully less ad hoc state than raw `fetch` for this app's interaction patterns |
| API layer | Next.js Route Handlers (App Router), REST-shaped | Explicit evaluation criterion is "API design"; must be curl/Postman-able, not hidden behind Server Actions or RPC |
| Validation | `zod`, generated from Drizzle schema via `drizzle-zod` where possible | Single source of truth across DB schema, validation, and TS types |
| AI provider | Google Gemini (`gemini-3.1-flash-lite`) behind the **Vercel AI SDK** (`ai` + `@ai-sdk/google`) | Free tier, no card required (Claude has no free tier). AI SDK keeps the provider a one-line swap (`@ai-sdk/google` → `@ai-sdk/groq`) and `generateObject` returns a structured, zod-validated `{title, description, template, tags}` — reuses the same zod schemas and demonstrates provider-independence |

## Data Model

Two tables carry the whole system. Full version history is append-only — every edit (internal or customer) writes a new row rather than mutating in place, which is what makes diffing/merging possible later.

```ts
// src/db/schema.ts

export const promptKind = pgEnum("prompt_kind", ["internal", "custom"]);
export const editedBy = pgEnum("edited_by", ["internal", "customer"]);

export const prompts = pgTable("prompts", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: promptKind("kind").notNull().default("custom"),
  sourcePromptId: uuid("source_prompt_id").references(() => prompts.id), // fork parent, if any
  syncedSourceVersion: integer("synced_source_version"),                 // last source version incorporated
  title: text("title").notNull(),
  description: text("description").notNull(),
  template: text("template").notNull(),
  tags: text("tags").array().notNull().default([]),
  currentVersion: integer("current_version").notNull().default(1),
  renderCount: integer("render_count").notNull().default(0),
  lastRenderedAt: timestamp("last_rendered_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const promptVersions = pgTable("prompt_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  promptId: uuid("prompt_id").notNull().references(() => prompts.id),
  versionNumber: integer("version_number").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  template: text("template").notNull(),
  tags: text("tags").array().notNull(),
  editedBy: editedBy("edited_by").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [unique().on(t.promptId, t.versionNumber)]);
```

Indexes: GIN index on `prompts.tags` for containment search; plain `ILIKE` on `title`/`description` (fine at this scale — document `pg_trgm`/full-text search as a noted future improvement, not built).

**Update detection**: a custom prompt has an update available when `source.currentVersion > custom.syncedSourceVersion`.
**Local-change detection**: compare the custom prompt's live fields against the merge base — the source prompt's snapshot at `custom.syncedSourceVersion` (looked up by versionNumber in the source's history).

## Q2 Reconciliation Logic — Field-Level 3-Way Merge

Not line-level (git-style) merging — that risks producing broken prompt text and is disproportionately expensive to build. Instead, merge at the granularity of the prompt's four fields, comparing `base` (fork point snapshot), `customer` (live), `internal` (live source):

- `title`, `description`: scalar 3-way — auto-take whichever side changed it; if **both** changed it to different values, it's a conflict requiring the customer to pick one.
- `template`: same scalar 3-way logic. This is the field most likely to actually conflict (it's the core content) — when it does, show a 2-way diff (`diff` npm package) of customer's vs internal's template so the customer can compare before picking a whole-field winner. No line-level merge UI.
- `tags`: always auto-mergeable, no conflict UI ever needed — sets don't have the "two values in one slot" problem scalars do.
  ```
  merged = (base ∩ customer ∩ internal) ∪ (customer − base) ∪ (internal − base)
  ```
  i.e. a base tag survives unless *both* sides independently removed it; any tag either side newly added is included. (Deliberately not naive `customer ∪ internal` union — that would resurrect a tag the customer explicitly removed just because internal's copy still has it.)

**Resolution actions** (both explicit, no silent merging):
- **Accept update** — apply the merge result (auto-merged fields + customer's picks for conflicting fields) as a new `editedBy: 'internal'` version; bump `syncedSourceVersion`.
- **Keep mine** — bump `syncedSourceVersion` only, no content change (acknowledges the update; banner reappears if internal publishes again).

**Simulating "internal team publishes an update"**: no auth/multi-user in scope, so this is simulated by reusing the same `PATCH /api/prompts/:id` endpoint — editing a `kind: 'internal'` prompt *is* publishing an update (creates a new `editedBy: 'internal'` version, bumps `currentVersion`). One endpoint, behavior branches on `kind`. A seed script also pre-populates one internal prompt with multiple versions and one forked customer copy with local edits, so the diff/merge UI has something to show on first load without manual setup.

## API Design

REST-shaped Route Handlers under `src/app/api/`:

- `POST /api/prompts` — create (manual or AI-assisted; body includes a `generateWithAI: boolean` + free-text brief, or the four fields directly)
- `GET /api/prompts?q=&tags=` — search by title/description/tags
- `GET /api/prompts/:id` — get one
- `PATCH /api/prompts/:id` — update (internal or custom; writes new `prompt_versions` row)
- `POST /api/prompts/:id/render` — body `{ variables: Record<string,string> }`, returns rendered text, increments `renderCount`/`lastRenderedAt`
- `POST /api/prompts/:id/fork` — adopt an internal prompt into a new `custom` prompt (sets `sourcePromptId`, `syncedSourceVersion`)
- `GET /api/prompts/:id/updates` — returns update-available status + merge preview (auto-merged fields, conflicting fields, diff data)
- `POST /api/prompts/:id/updates/accept` — apply merge result
- `POST /api/prompts/:id/updates/dismiss` — "keep mine"

All bodies validated with `zod` schemas derived from the Drizzle table defs (`drizzle-zod`).

## UI Design

**Multi-route** app (not a single page), built with shadcn/Base UI + Tailwind, backed by
TanStack Query hooks per endpoint. Routes are real URLs — shareable, refresh-safe,
back-button friendly (a deliberate "UX clarity and predictability" choice):

- **`/` — Library (list)**: debounced search box (hits `GET /api/prompts?q=`); a
  **segmented filter `All / Internal / Mine`** (uses the `kind` query param the API
  already supports); a "New Prompt" button; prompt cards showing title, description
  snippet, tag chips, a small **kind badge** (`Internal` / `Yours`), and an **"Update
  available"** marker on customer copies with a pending merge. Clicking a card →
  `/prompts/[id]`.
- **`/prompts/[id]` — Detail**: "back to library" link, then **tabs**:
  - *Overview*: title, description, tags, template with `{{variables}}` highlighted,
    usage stats (render count, last used), **Edit** button. Internal prompts show a
    **Fork ("Use this prompt")** action; customer copies show the **update banner** when
    one is pending (opens the merge dialog — see Q2).
  - *Render*: auto-detects `{{vars}}` from the template, renders an input per variable,
    calls `POST /:id/render`, shows substituted output (warns on unfilled vars), and
    reflects the bumped usage stats.
  - (No History tab — cut to stay minimal, though the data exists.)
- **`/prompts/new` — Create** and **`/prompts/[id]/edit` — Edit**: same full-page form
  (title, description, template with a `{{var}}` hint, tags). Create adds a
  **"Write manually" / "Draft with AI"** toggle; AI mode posts a brief to
  `POST /api/prompts/draft`, fills the form for the user to review/tweak, and never
  auto-saves.
- **Merge dialog** (Q2, modal over the detail page): auto-merged field summary, a
  side-by-side diff + radio choice per conflicting scalar field, merged tag set,
  and **Accept** (applies merge + conflict picks) / **Keep mine** actions.

## File Structure

```
src/
  app/
    layout.tsx                    # QueryClient provider + Toaster
    page.tsx                      # / — library list (search, segmented filter, cards)
    prompts/[id]/page.tsx         # detail (Overview/Render tabs, fork, update banner)
    prompts/new/page.tsx          # create form (+ AI-assist toggle)
    prompts/[id]/edit/page.tsx    # edit form
    api/prompts/route.ts          # POST create, GET search
    api/prompts/[id]/route.ts     # GET, PATCH
    api/prompts/[id]/render/route.ts
    api/prompts/[id]/fork/route.ts
    api/prompts/[id]/updates/route.ts
    api/prompts/[id]/updates/accept/route.ts
    api/prompts/[id]/updates/dismiss/route.ts
  db/  (schema.ts, index.ts, queries.ts, seed.ts)
  lib/
    render-template.ts            # {{var}} substitution
    merge.ts                      # field-level 3-way merge (scalar + tag-set logic)
    ai.ts                         # AI SDK generateText/Output.object → zod-validated draft
    schemas.ts, http.ts           # zod request schemas + route helpers
    api-client.ts                 # typed fetch wrappers for the API
    query-provider.tsx            # TanStack Query client provider
  components/
    prompt-card.tsx, prompt-form.tsx, render-panel.tsx,
    update-banner.tsx, merge-dialog.tsx, diff-view.tsx, kind-badge.tsx
  hooks/
    use-prompts.ts (list/search), use-prompt.ts (get), use-prompt-mutations.ts
    (create/update/render/fork), use-prompt-updates.ts (status/accept/dismiss)
drizzle.config.ts
```

## Implementation Order

1. **Setup**: install Drizzle, `@neondatabase/serverless`, `drizzle-kit`, `zod`, `drizzle-zod`, `@tanstack/react-query`, `ai` + `@ai-sdk/google`, shadcn/ui; provision Neon project (Sydney / `ap-southeast-2` region) and paste `DATABASE_URL` into `.env.local`; `drizzle.config.ts`; `schema.ts`; run first migration
2. **Q1 API**: create/get/search/update/render route handlers + `render-template.ts`
3. **Q1 UI** (multi-route): `/` list+search+segmented filter, `/prompts/new` + `/prompts/[id]/edit` form (with AI-assist), `/prompts/[id]` detail with Overview/Render tabs, wired via TanStack Query hooks
4. **Usage tracking**: render count/last-used wired into render endpoint and displayed in detail panel
5. **Q2 versioning plumbing**: every mutation writes a `prompt_versions` row; fork endpoint
6. **Q2 merge logic**: `lib/merge.ts` (scalar 3-way + tag set-merge), `updates` GET endpoint
7. **Q2 UI**: update banner, diff view, accept/dismiss actions
8. **Seed script**: demonstrates the full Q2 scenario out of the box (internal prompt with 2 versions, one forked+customer-edited copy showing a live conflict)
9. **Deploy**: Vercel project linked to Neon, env vars, verify live
10. **Docs**: `README.md` (setup, run, example scenarios) + design doc (decisions, assumptions/trade-offs, problem analysis) per submission guidelines

## Verification

- `bun run lint` / `tsc --noEmit` clean
- Manual click-through of the seeded demo: search by tag, render a prompt (confirm variable substitution + usage stats update), edit a custom prompt, edit the seeded internal prompt (simulating a publish) and confirm the update banner appears on its forked copy, walk the merge panel (confirm non-conflicting fields auto-merge, conflicting `template` shows a diff), Accept then Keep-mine on separate copies to confirm both paths behave as designed
- Confirm the live Vercel deployment reproduces the same scenario end-to-end before submission
