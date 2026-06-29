# Convex Backend Refactor Plan

Goal: make the Convex backend easier to maintain without changing public
frontend-facing behavior.

## Non-Regression Contract

Public Convex functions used by the frontend must keep their module path,
function name, function kind, and argument shape unless a migration is planned
explicitly.

Run after each backend refactor lot:

```bash
npm run check:convex-contract
npx tsc --noEmit -p convex/tsconfig.json
npm run typecheck
npm run build
git diff --check
```

When Convex validators, public functions, or internal function references
change, also sync the Convex runtime:

```bash
npx convex dev --once
```

After `npx convex dev --once`, remove generated-only diffs under
`convex/_generated/**` unless the generated API change is deliberate.

## Public API Surface To Preserve

- `generation.cancelJob`
- `generation.pollJob`
- `jobs.costSummary`
- `jobs.create`
- `jobs.get`
- `jobs.list`
- `jobs.retry`
- `jobs.reviewImages`
- `products.facets`
- `products.getWithImages`
- `products.list`
- `products.navigation`
- `prompts.create`
- `prompts.list`
- `prompts.master`
- `prompts.remove`
- `prompts.reorder`
- `prompts.resetMaster`
- `prompts.setPreset`
- `prompts.update`
- `prompts.updateMaster`
- `settings.list`
- `settings.set`
- `settings.shopInfo`
- `shopify.deleteImage`
- `shopify.pushProductImages`
- `shopify.reorderProductImages`
- `shopify.syncProduct`
- `shopify.syncProducts`
- `shops.connect`
- `shops.list`
- `shops.setActive`
- `users.hasUsers`

## Refactor Lots

### Lot 1: Guardrails

Status: done.

- Add a contract check for frontend `api.*` references.
- Keep generated Convex files untouched in committed diffs.
- Keep root Convex modules as public facades.
- Block Convex `query`, `mutation`, `action`, and internal function exports in
  nested helper modules.

### Lot 2: Scoped Settings

Status: done.

- Extract scoped app settings reads and merges from `settings.ts`.
- Keep `settings.list`, `settings.set`, and `settings.shopInfo` paths stable.
- Preserve legacy/global and shop-scoped behavior.

### Lot 3: Product Workflow

Status: done.

- Extract pure product workflow summary calculations from `products.ts`.
- Extract product catalog projection, filters, facets, and legacy workflow
  fallback helpers into `convex/products/catalog.ts`.
- Keep product list/detail result shape unchanged.
- Avoid schema changes and migrations in this lot.

### Lot 4: Prompt Repository

Status: done.

- Extract prompt template and prompt settings reads from `prompts.ts`.
- Extract prompt access/master payload helpers into `convex/prompts/access.ts`.
- Reuse the same repository helpers from `jobs.create`.
- Keep all `api.prompts.*` paths stable.
- Preserve legacy prompt settings fallback order.

### Lot 5: Jobs Planning, Summaries, Lifecycle

Status: done.

- Extract pure image-task planning from `jobs.create`.
- Extract job cost and review summary helpers from `jobs.ts`.
- Extract stored-cost fallback helpers from `jobs.costSummary` into
  `convex/jobs/summaries.ts`.
- Extract pure lifecycle status predicates and patch payload builders.
- Extract job list filters/pagination validators into `convex/jobs/validators.ts`.
- Extract generation engine selection from settings into `convex/jobs/engine.ts`.
- Keep lifecycle mutations and scheduling in `jobs.ts`.
- Preserve exact regeneration correction prompt wording.

### Lot 6: Generation Helpers

Status: done for isolated helpers, real-time OpenAI provider, real-time Gemini
provider, OpenAI batch submission, OpenAI batch poll/cancel helpers, Gemini
batch parsing helpers, Gemini batch network helpers, Gemini stream parsing
helpers, batch ingestion helpers, and vibe analysis/prompt staging helpers.
Batch polling rules and result types are also isolated in a pure helper.

- Extract common generation runtime helpers from `generation.ts`.
- Extract provider id, usage, MIME, and extension helpers.
- Extract R2 storage helpers.
- Extract Node image processing helpers.
- Extract FAL background removal client.
- Extract real-time OpenAI provider client.
- Extract real-time Gemini provider client.
- Extract shared batch result/poll types.
- Extract OpenAI batch poll/cancel provider helpers.
- Extract OpenAI batch submission provider helper.
- Extract Gemini batch status/result parsing helpers.
- Extract Gemini batch network provider helpers.
- Extract Gemini batch stream parsing helpers.
- Extract shared `GeneratedImage` type.
- Extract binary download helper.
- Extract background post-processing helper to remove ingestion import cycles.
- Extract batch ingestion helpers into `convex/generation/batchIngestion.ts`.
- Extract vibe analysis and prompt staging helpers into
  `convex/generation/vibe.ts`.
- Extract batch polling result types, backoff constants, and cancellable-status
  rules into `convex/generation/batchPollingRules.ts`.
- Keep `ProviderGenerationError` as one shared class so provider ids survive
  `instanceof` checks in `generation.ts`.
- Keep all `api.generation.*` and `internal.generation.*` paths stable.
- Do not combine provider extraction with lifecycle behavior changes.

### Lot 7: Shopify Helpers

Status: done for pure helpers and client helpers.

- Extract Shopify product/image mappers from `shopify.ts`.
- Extract Shopify GraphQL client helper.
- Extract Shopify GraphQL documents into `convex/shopify/graphql.ts`.
- Extract pure Shopify media helper functions.
- Keep all `api.shopify.*` paths stable.

## Pending Safe Lot

Next recommended lot: audit remaining generation orchestration before extracting
anything else.

For `jobs.ts`, remaining large sections are mostly mutation lifecycle, retry,
batch ingestion leases, completion counters, and scheduler handoff. Treat those
as orchestration until a behavior map proves a helper is pure.

Candidate scope:

- Review `submitBatch`, `pollOneBatch`, `processTerminalBatch`, `pollBatches`,
  `pollBatchJob`, `pollJob`, `cancelJob`, and `processJob`.
- Identify only the pure helper seams that do not own Convex function
  registration, scheduling, cancellation, or public/internal function paths.
- Keep all public and internal Convex function references under
  `convex/generation.ts` unless a migration plan is written.

Rules for that lot:

- Do not move orchestration, Convex actions, job polling, cancellation, or
  scheduling in the same patch as helper extraction.
- First produce a behavior map for batch state transitions, terminal ingestion,
  cancellation, retries, and realtime generation.
- Only extract a helper when its inputs/outputs can be typechecked without
  importing Convex registered functions from nested modules.
- Run the full non-regression contract after any patch.

Recommended sub-agents for this lot:

- Explorer: map remaining generation orchestration responsibilities and list
  safe helper candidates with concrete risk notes.
- Explorer: compare public Convex functions and frontend `api.*` references
  before and after any extraction.

## Acceptance Criteria

- No committed changes under `convex/_generated/**`.
- Public API contract check passes.
- Convex-only typecheck passes.
- Global typecheck passes.
- Production build passes.
- `git diff --check` passes.
- `npx convex dev --once` reports `Convex functions ready!`.
- Any behavior-changing migration has a rollback note and manual validation path.
