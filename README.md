# Shopify Image Studio

Mobile-first TanStack Start + Convex app for generating Shopify curtain product imagery with OpenAI, storing generated assets in Cloudflare R2, reviewing them, and manually pushing approved images back to Shopify.

The original local CLI workflow remains in `src/` for reference, but the primary app now lives in:

- `app/` for TanStack Start routes and React UI
- `convex/` for schema, auth, realtime queries, mutations, actions, and background jobs
- `app/lib/` and `convex/lib.ts` for migrated image type, normalization, fixation detection, and prompt rendering behavior

## What It Does

- Login-protects app pages with Convex Auth password auth.
- Syncs active Shopify products through the Admin GraphQL API into Convex.
- Detects fixation types using the preserved normalization and synonym behavior.
- Filters products by name/handle, category, collection, and generation state.
- Generates selected image types in Convex background jobs with realtime progress.
- Stores image bytes in Cloudflare R2 and stores only URLs/metadata in Convex.
- Lets you edit/reset prompt templates in `/settings/prompts`.
- Shows product detail pages with current Shopify images, generated images, prompts, history, errors, and detected fixations.
- Pushes generated images to Shopify only after explicit confirmation.
- Optionally replaces the current Shopify gallery only when the replacement checkbox is confirmed.

## Setup

```bash
npm install
cp .env.example .env
```

Configure Convex:

```bash
npx convex dev
```

This creates or links a Convex deployment and populates `CONVEX_DEPLOYMENT` plus `VITE_CONVEX_URL`. After Convex is configured, run:

```bash
npx convex dev
npm run dev
```

Open the TanStack Start URL printed by Vite, usually `http://localhost:5173`.

## Environment

Required app and auth values:

```env
CONVEX_DEPLOYMENT=
CONVEX_DEPLOY_KEY=
VITE_CONVEX_URL=
VITE_CONVEX_SITE_URL=
AUTH_SECRET=
AUTH_URL=
SITE_URL=
JWT_PRIVATE_KEY=
JWKS=
```

`AUTH_SECRET` and `AUTH_URL` are kept for deployment compatibility. Convex Auth also requires `SITE_URL`, `JWT_PRIVATE_KEY`, and `JWKS`; the Convex Auth setup command can generate and set the key material for the Convex deployment.

OpenAI image generation:

```env
OPENAI_API_KEY=
OPENAI_IMAGE_MODEL=gpt-image-2-2026-04-21
OPENAI_IMAGE_SIZE=1024x1024
OPENAI_IMAGE_QUALITY=medium
OPENAI_IMAGE_OUTPUT_FORMAT=jpeg
OPENAI_IMAGE_REQUESTS_PER_MINUTE=5
GENERATION_CONCURRENCY=1
```

Shopify Admin GraphQL:

```env
SHOPIFY_SHOP_DOMAIN=
SHOPIFY_CLIENT_ID=
SHOPIFY_CLIENT_SECRET=
SHOPIFY_API_VERSION=2026-04
SHOPIFY_PRODUCT_QUERY=status:active
```

Cloudflare R2:

```env
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
R2_PUBLIC_BASE_URL=
```

`R2_PUBLIC_BASE_URL` must point at a public bucket/custom-domain base URL, because Shopify imports generated images from those URLs.

## Main Flow

1. Visit `/login`.
2. Create the first admin account, then sign in.
3. Go to `/settings/prompts` and seed default prompts if they are not already present.
4. Go to `/products` and click **Sync Shopify**.
5. Select one or more products.
6. Choose image types with checkboxes. The budget preset selects `situation`, `closeup`, `texture`, and `oeillets` when available.
7. Start the background generation job.
8. Watch realtime progress in `/jobs/$jobId`.
9. Inspect generated URLs and prompt history in `/products/$productId`.
10. Click **Push**, confirm, and optionally choose whether to replace the existing Shopify gallery.

## Image Type Rules

Every product offers:

- `situation`
- `closeup`
- `texture`

Fixation images are offered only when detected:

- `multi-fonction`
- `passe-tringle`
- `galon-fronceur-crochets-escargot`
- `oeillets`
- `plis-flamands-agrafes-flamandes`

Bulk mode shows image types available across selected products. If a fixation type is selected, the job creates that task only for products that actually have that fixation.

## Safety

- Secrets are only read by Convex actions or server runtime code, never from browser bundles.
- Generated image binaries are uploaded to R2, not stored in Convex.
- Shopify prices, stock, variants, descriptions, status, and inventory are never modified.
- Generated images are never pushed automatically after generation.
- Existing Shopify images are not deleted unless the user explicitly confirms gallery replacement during push.

## Validation

```bash
npm run typecheck
npm run build
```

Convex validation requires a linked deployment or deploy key:

```bash
CONVEX_DEPLOY_KEY=... npx convex dev --once --typecheck enable
```

`convex dev --once` regenerates `convex/_generated`, typechecks Convex functions, and pushes them to the configured dev deployment.

## Deploy On Vercel

1. Create/link the Convex deployment.
2. Add the environment variables above to Vercel and Convex as appropriate.
3. Deploy Convex functions with `npx convex deploy`.
4. Deploy the TanStack Start app to Vercel with `npm run build`.

Keep OpenAI, Shopify, and R2 secrets out of `VITE_` variables. Only `VITE_CONVEX_URL` is browser-visible.

## Legacy CLI

The older local automation commands still exist:

```bash
npm run dry-run -- --limit=1
npm run export-images -- --limit=10
npm run generate -- --limit=10
npm run attach-images -- --limit=10
npm run review -- --limit=10
```

They are retained for comparison while the deployed app becomes the main workflow.
