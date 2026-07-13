# Design Notes

Problem analysis, key decisions, and trade-offs. Part 1 (the library) is deliberately
straightforward; most of the interesting design work is in Part 2 (reconciling updates),
so that gets the most space here.

---

## 1. Problem analysis

### Part 1 — Prompt Library
A CRUD service over prompts (`title`, `description`, `template`, `tags`) with three
non-CRUD requirements: **search** (title/description/tags), **rendering**
(`{{variable}}` substitution), and **usage tracking** (render count, last used). All
low-risk; the only real decisions are data modelling and how to expose the API.

### Part 2 — Managing Prompt Updates
The hard part. A customer starts from an internal prompt. Over time **both** sides
edit it, and internal may publish **multiple** updates. The system must let the
customer "benefit from internal improvements **without unexpectedly losing changes
they have made**."

The key insight: that sentence asks for **both outcomes at once**, not an either/or.
"Take theirs" (lose your edits) and "keep mine" (never improve) are both trivial and
both wrong. The interesting requirement is to *combine* non-conflicting changes
automatically and only involve the human where the two sides genuinely collide. That
framed the whole solution as a **3-way merge** problem (a common ancestor + two
divergent versions), the same shape as `git`.

---

## 2. Data model

Two tables (`src/db/schema.ts`):

- **`prompts`** — the current state of every prompt. `kind` is `internal` (a canonical
  source) or `custom` (a customer copy). A copy also stores `sourcePromptId` (what it
  was forked from) and `syncedSourceVersion` (the source version it last reconciled
  against). `currentVersion` denormalises the latest version number; `renderCount` /
  `lastRenderedAt` cover usage.
- **`prompt_versions`** — an **append-only** snapshot of the four content fields on
  every edit, keyed by `(promptId, versionNumber)`.

**Why append-only history?** A 3-way merge needs the *common ancestor* — the content
the copy was based on. If we mutated rows in place we'd have no way to reconstruct it.
Storing every version makes the merge base a simple lookup and gives a full audit trail
for free.

**Tags as a Postgres `text[]` (with a GIN index), not a join table.** Tags here have no
identity or metadata of their own — a join table would be relational purity with no
payoff. Array containment covers the search need. (If tags later needed ownership,
descriptions, renaming, etc., a join table would become worthwhile.)

**Search** uses `ILIKE` on title/description plus array matching on tags. Fine at this
scale; `pg_trgm` or full-text search is the documented next step if it needed to grow.

---

## 3. Q2 — reconciliation design (the core)

### Field-level 3-way merge, not line-level
Rather than a git-style line-by-line merge of the template text, the merge operates at
the granularity of the prompt's **four fields**. For each field we compare
`base` (source content at `syncedSourceVersion`), `customer` (the copy's live value),
and `internal` (the source's live value):

| Situation | Result |
|---|---|
| Only internal changed | Auto-adopt internal's value (a free improvement) |
| Only the customer changed | Keep the customer's value |
| Both changed to the same value | No conflict |
| Both changed to different values | **Conflict** — the customer picks |

This directly satisfies "benefit without losing changes": if internal improved the
`description` while the customer only touched the `template`, the description is adopted
and the template is kept — **automatically, no prompt**.

**Why field-level and not line-level?** A prompt template is a small, cohesive block of
instructions. Line-level merges of prose frequently produce broken, nonsensical text
(unlike code, where line structure carries meaning). Whole-field resolution is both
*cheaper to build* and *more correct* for this content. It's a deliberate scope cut,
documented as such. The one field likely to actually conflict — `template` — gets a
word-level **diff** so the customer can compare before choosing.

### Tags merge as a set (no conflict UI)
```
merged = (base ∩ customer ∩ internal) ∪ (customer − base) ∪ (internal − base)
```
A base tag survives unless *both* sides removed it; any tag either side newly added is
kept. This deliberately avoids a naive `customer ∪ internal` union, which would
resurrect a tag the customer explicitly removed. Sets don't have the "two values, one
slot" problem, so tags never need a manual choice.

### The merge base comes from the *source's* history
`base` = the source prompt's snapshot at the copy's `syncedSourceVersion` — **not** the
copy's own snapshots. This matters: it makes the base the true common ancestor from the
internal side, so a customer's "keep mine" decision is preserved and they get
*re-prompted* on the **next** conflicting update, instead of silently losing their
customization. (`editedBy` on version rows is provenance/audit only; it is not used to
compute the base.)

### Resolution actions (both explicit — no silent merging)
- **Accept** — persist the merge (auto-merged fields + the customer's conflict picks) as
  a new version, and advance `syncedSourceVersion`.
- **Keep mine** — advance `syncedSourceVersion` only; content unchanged. The banner
  clears and reappears only if the source publishes again.

Conflicts default to **"keep mine"** — the safe, no-data-loss choice if the user just
clicks Accept without deciding.

### No-op guards
Two places short-circuit redundant history:
- `acceptUpdate` — if the source advanced but the merge nets to no change (e.g. internal
  reverted an edit), it advances the synced pointer without writing a version.
- `updatePrompt` — a PATCH whose content equals the current content writes no version
  and doesn't bump `currentVersion`. This protects the public API too, not just the edit
  form.

### Simulating "internal publishes an update"
With no auth/multi-user in scope, editing an `internal` prompt via the same
`PATCH /api/prompts/:id` **is** publishing an update: it appends a version and bumps
`currentVersion`, which is exactly what makes updates available to its copies. One
endpoint, behaviour keyed on `kind` — no special mechanism needed.

---

## 4. API design

**Next.js Route Handlers, REST-shaped** (`POST /api/prompts`, `GET /api/prompts/:id`,
`POST /api/prompts/:id/render`, …). Chosen over Server Actions or tRPC because "API
design" is an explicit evaluation criterion and these are real, curl-able,
verb/URL-shaped endpoints — the API surface is visible rather than hidden behind RPC.

**Validation with zod** on every request body, with a consistent JSON error envelope.

**Update status: two endpoints, deliberately asymmetric.**
- The **list** endpoint computes a cheap `updateAvailable` **boolean** per row (a
  self-join comparing version numbers). Inlining it avoids N+1 `/updates` calls and
  keeps library markers correct in every filter.
- The **detail** update status lives behind its own `GET /:id/updates`, returning the
  full merge preview (which requires an extra base-snapshot read + the merge
  computation). It's kept separate because it's heavy and only relevant for custom
  copies — folding it into every `GET /:id` would make edit/render fetches pay for a
  merge they never show, and would couple the prompt-content cache to the
  update-status cache (they change for different reasons: content on edit, status when
  *either* the prompt or its source changes). The asymmetry tracks the inversion in
  cardinality and cost between the two cases.

**Transactions.** Every content mutation (create/update/fork/accept) runs in a
transaction that writes the row and its version snapshot together, so they can't drift.
This drove the choice of Neon's WebSocket driver (`neon-serverless` + `Pool`) over the
HTTP driver, which doesn't support interactive transactions.

---

## 5. Frontend & state

**Multi-route App Router app** (`/`, `/prompts/[id]`, `/prompts/new`,
`/prompts/[id]/edit`) rather than one clever page — real URLs are shareable,
refresh-safe, and back-button-friendly (a "predictability" win).

**TanStack Query** for all server state. It earns its place on two interactions that
are fiddly to hand-roll: **search-as-you-type** (request dedup + `keepPreviousData` to
avoid stale-response flicker) and **cross-view invalidation** (a mutation on one prompt
must refresh the list *and* the detail *and*, for Q2, other copies' update status).
Query keys are namespaced so, e.g., invalidating all `["updates"]` after an edit doesn't
clobber the detail cache we just wrote.

**shadcn/ui on Base UI primitives** + Tailwind — accessible components without building
dialogs/tabs/inputs from scratch, and without looking over-polished.

---

## 6. Assumptions & trade-offs

- **Single user, no auth** (per scope). "Internal team" vs "customer" is modelled by the
  `kind` field, and publishing an update is just editing an internal prompt. A real
  system would put these behind ownership/permissions.
- **Field-level (not line-level) merge** — cheaper and more correct for prompt text; the
  documented cost is that you can't merge two edits *within* the same template line, only
  choose one side for that field.
- **AI provider = Gemini** (`gemini-3.1-flash-lite`) behind the Vercel AI SDK, chosen for
  a genuine free tier. The SDK abstraction makes the provider a one-line swap, and
  structured output is validated against a schema. AI drafting is best-effort and fully
  optional — the app degrades gracefully without a key.
- **Dev & build on webpack, not Turbopack.** Turbopack's dev HMR throws on an
  unrecognised worker "ping" message
  ([vercel/next.js#86495](https://github.com/vercel/next.js/issues/86495)), and its build
  path mis-bundled the Neon/`ws`/AI-SDK native packages during "collect page data". Both
  are avoided on webpack; native packages are also declared in `serverExternalPackages`.
- **Optimistic-ish caching.** Mutations seed the detail cache from authoritative
  responses and invalidate lists; usage counters propagate to the list lazily (marked
  stale, refetched when next viewed) rather than eagerly.

---

## 7. Known limitations / future work

- **Search** is `ILIKE`-based; would move to full-text / trigram indexes at scale.
- **Version history is stored but not surfaced** in the UI (a "History" tab was cut to
  stay minimal). The data is all there.
- **No optimistic UI** on mutations — they show a brief pending state and refetch.
  Fine for a single user; optimistic updates would be the next polish step.
- **Reconciliation is field-level.** A future richer version could offer line-level
  merge *within* the template for power users, with the field-level flow as the default.
- **No pagination** on the library list (single-user scale). Trivial to add to the
  search endpoint.
