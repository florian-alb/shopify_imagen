# Repository Guidelines

## Project Structure & Module Organization

This is a TypeScript Shopify image automation app. The TanStack Start/React UI lives in `app/`, with routes in `app/routes/`, shared UI in `app/components/ui/`, and client helpers in `app/lib/`. Convex backend code is in `convex/`; keep schema, auth, jobs, crons, Shopify actions, and generation logic there. Prompt templates are stored in `prompts/`, one file per image type. One-off maintenance scripts belong in `scripts/`. Generated or downloaded image files belong under `output/`.

## Build, Test, and Development Commands

Use npm for repository workflows:

- `npm run dev` starts the Vite/TanStack app locally.
- `npm run convex:dev` runs Convex, pushes backend changes, and keeps crons active.
- `npm run typecheck` runs TypeScript checks for the app and Convex code.
- `npm test` runs the typecheck command.
- `npm run build` builds the app for production.
- `npm run images_switch` runs the Shopify image-order maintenance script using `.env`.

For Convex-only validation, use `npx tsc --noEmit -p convex/tsconfig.json` and `npx convex dev --once`.

## Coding Style & Naming Conventions

Use strict TypeScript and ES modules. Follow the existing 2-space indentation, semicolon-light style, and React function component patterns. Name route files after their URL segments, such as `app/routes/products/$productId.tsx`. Keep reusable UI primitives in `app/components/ui/`; place domain helpers beside their runtime boundary (`app/lib/`, `convex/`, or `scripts/`). Prompt filenames should match image type slugs, for example `plis-flamands-agrafes-flamandes.txt`.

## Testing Guidelines

There is no dedicated unit test runner configured. Treat `npm run typecheck`, `npm run build`, Convex validation, and targeted manual checks in the app as the baseline before shipping changes. When adding tests, colocate them near the code under test and use `*.test.ts` or `*.test.tsx` naming.

## Commit & Pull Request Guidelines

Recent history uses Conventional Commits such as `feat:`, `fix:`, and `refactor:`. Keep subjects imperative and scoped to one change. Pull requests should include a short summary, validation commands run, linked issue or task context, and screenshots for visible UI changes. Call out any Shopify, Convex, R2, OpenAI, or Gemini configuration changes explicitly.

## Security & Agent-Specific Instructions

Never expose secrets through `VITE_` variables unless they are intentionally browser-safe. Keep OpenAI, Gemini, Shopify, and R2 keys in server-side Convex or deployment environments. Agents should prefix shell commands with `rtk` for compact output, using raw commands only when debugging filtered output.
