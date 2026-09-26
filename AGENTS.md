# Repository Guidelines

## Project Structure & Module Organization

This is a TypeScript Shopify image automation app. The TanStack Start/React UI lives in `app/`, with routes in `app/routes/`, shared UI in `app/components/ui/`, and client helpers in `app/lib/`. Convex backend code is in `convex/`; keep schema, auth, jobs, crons, Shopify actions, and generation logic there. Prompt templates are stored in `prompts/`, one file per image type. One-off maintenance scripts belong in `scripts/`. Generated or downloaded image files belong under `output/`.

## Build, Test, and Development Commands

Use npm for repository workflows:

- `npm run dev` starts the Vite/TanStack app locally.
- `npm run convex:dev` runs Convex, pushes backend changes, and keeps crons active.
- `npm run typecheck` runs TypeScript checks for the app and Convex code.
- `npm test` runs the Vitest suite; typechecking is a separate command.
- `npm run build` builds the app for production.
- `npm run images_switch` runs the Shopify image-order maintenance script using `.env`.

For Convex-only validation, use `npx tsc --noEmit -p convex/tsconfig.json` and `npx convex dev --once`.

## Coding Style & Naming Conventions

Use strict TypeScript and ES modules. Follow the existing 2-space indentation, semicolon-light style, and React function component patterns. Name route files after their URL segments, such as `app/routes/products/$productId.tsx`. Keep reusable UI primitives in `app/components/ui/`; place domain helpers beside their runtime boundary (`app/lib/`, `convex/`, or `scripts/`). Prompt filenames should match image type slugs, for example `plis-flamands-agrafes-flamandes.txt`.

## Testing Guidelines

The project uses Vitest and `convex-test`. Run tests relevant to the change, `npm run typecheck`, `npm run build`, and targeted manual checks in the app before shipping changes. Run `npm run check:convex-contract` when changing frontend/backend integration. Convex validation commands that push functions affect the selected deployment; identify the target before running them. When adding tests, colocate them near the code under test and use `*.test.ts` or `*.test.tsx` naming.

## Catalogue Import — Required Context

Before modifying the catalogue import module, read [docs/catalog-workspace-context.md](docs/catalog-workspace-context.md). It is the implementation handoff for future agents: architecture, data model, read/edit/collection/export paths, versioning, search semantics, cache behavior, known pitfalls, and outstanding validation.

- Read [docs/catalog-workspace-migration.md](docs/catalog-workspace-migration.md) before any migration or rollback, and [docs/catalog-workspace-qualification.md](docs/catalog-workspace-qualification.md) for measured results and their limits. The initial plan under `.agents/prompts/` is historical guidance; verify assumptions against the current code.
- For migrated catalogues, Convex is the editable source of truth. Do not rebuild current lists from R2 or load the whole catalogue to show a page. R2 retains raw sources, checkpoints, and immutable snapshots.
- Preserve the shared effective-value resolver, manual overrides, source identities, English tags, content language, exact substring search, worker generation fences, and snapshot isolation. Keep optional SEO business changes separate.
- Generated Convex `api.*` references are unstable proxies. In subscription effects, use stable function names and arguments; do not depend on proxy object identity. Repeated cached calls can still indicate a frontend subscription loop.
- Keep this context and the migration/qualification documents up to date when their contracts or evidence change. Do not describe isolated tests as a completed authenticated end-to-end check.
- Known development deployment: `curious-greyhound-437`; production: `youthful-bandicoot-479`. Verify the actual target before deployment-affecting commands. Prior dev-to-prod transfer permission is not reusable: production deployment/data changes and real Shopify imports require explicit authorization for the intended action.

## Commit & Pull Request Guidelines

Recent history uses Conventional Commits such as `feat:`, `fix:`, and `refactor:`. Keep subjects imperative and scoped to one change. Pull requests should include a short summary, validation commands run, linked issue or task context, and screenshots for visible UI changes. Call out any Shopify, Convex, R2, OpenAI, or Gemini configuration changes explicitly.

## Security & Agent-Specific Instructions

Never expose secrets through `VITE_` variables unless they are intentionally browser-safe. Keep OpenAI, Gemini, Shopify, and R2 keys in server-side Convex or deployment environments. Agents should prefix shell commands with `rtk` for compact output, using raw commands only when debugging filtered output.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
