# Shopify Curtain Image Automation

Local Node.js + TypeScript automation for a Shopify curtain store.

The current flow is intentionally simple:

- read products and product images from the Shopify Admin GraphQL API
- export existing Shopify product images locally
- detect curtain fixation options from Shopify product data
- generate premium product images with the OpenAI image API
- approve generated images in a local review UI before replacing Shopify product galleries

## Setup

```bash
npm install
cp .env.example .env
```

Required for Shopify export:

```env
SHOPIFY_SHOP_DOMAIN=your-shop.myshopify.com
SHOPIFY_CLIENT_ID=...
SHOPIFY_CLIENT_SECRET=shpss_...
SHOPIFY_API_VERSION=2026-04
SHOPIFY_PRODUCT_QUERY=status:active
```

Required for live image generation:

```env
OPENAI_API_KEY=sk-...
OPENAI_IMAGE_MODEL=gpt-image-1
OPENAI_IMAGE_SIZE=1024x1024
OPENAI_IMAGE_QUALITY=medium
OPENAI_IMAGE_OUTPUT_FORMAT=jpeg
GENERATION_CONCURRENCY=1
OPENAI_IMAGE_REQUESTS_PER_MINUTE=5
```

The Shopify app needs read access to products/media. The script exchanges `SHOPIFY_CLIENT_ID` and `SHOPIFY_CLIENT_SECRET` for a short-lived Admin API access token using Shopify's client credentials grant.

## Commands

```bash
npm run dry-run -- --limit=1
npm run test -- --limit=1
npm run export-images -- --limit=10
npm run generate -- --limit=10
npm run attach-images -- --limit=10
npm run review -- --limit=10
npm run full -- --limit=180
```

You can override the Shopify product search query per command:

```bash
npm run dry-run -- --query="status:active tag:rideau" --limit=5
```

Use budget mode to generate only `situation`, `closeup`, `texture`, and `oeillets`:

```bash
npm run dry-run -- --budget --limit=1
npm run full -- --budget --limit=1
```

Use controlled parallel generation to speed up OpenAI calls:

```bash
npm run generate -- --budget --limit=1 --concurrency=3
npm run full -- --budget --limit=10 --concurrency=1
```

`GENERATION_CONCURRENCY` and `--concurrency` control how many images are generated at the same time for each product. If your OpenAI limit is `5 input-images per min`, keep this at `1`; the app also spaces image requests using `OPENAI_IMAGE_REQUESTS_PER_MINUTE`.

By default, existing generated files are skipped. Use `--force` to regenerate and overwrite them:

```bash
npm run full -- --budget --limit=10 --concurrency=1 --force
```

## Dry Run

Dry-run:

- loads prompt templates from `/prompts`
- reads Shopify products through the Admin API when credentials exist
- falls back to one local mock product when credentials are missing
- detects fixation options from options, variants, tags, and metafields
- prints the supplier reference image URL selected for generation
- prints required image types, output filenames, and prompt previews
- writes non-destructive state to `/state/state.json`

Dry-run never calls OpenAI and never mutates Shopify.

## Export Images

`export-images` downloads existing Shopify product images into:

```text
output/shopify-images/{{product-handle}}/
```

Each product gets a `manifest.json` containing the Shopify media ID, original CDN URL, local path, and alt text.

## Generate

`generate` downloads the supplier reference image into `/output/references`, sends a normalized reference file with the rendered prompt to OpenAI, saves generated images into `/output/downloads/{{product-handle}}/`, and updates `/state/state.json` after each successful image.

`full` exports current Shopify images and generates the new local images. It does not push anything to Shopify; use `review` to approve products one by one.

`attach-images` uploads generated images to Shopify, then removes the previous Shopify product media so the product gallery keeps only the generated images. It does not update product text, variants, prices, inventory, or status. The Shopify app needs the `write_products` scope for this step.

`review` starts a local approval UI:

```bash
npm run review -- --limit=10
```

The command builds the React review app, then serves it at `http://localhost:8787`. Review the current Shopify images next to the generated images, then approve a product to replace its Shopify gallery with only the generated images.

The review app also supports bulk generation:

- filter products by name, category, or collection
- select visible products with checkboxes
- open a routed product detail page (`/products/:id`) to inspect generated images, previous Shopify images, detected fixations, and state
- generate selected products in budget mode with API-friendly concurrency
- optionally enable `Regenerate existing`
- push generated images product by product after review

Every product always gets:

- `situation`
- `closeup`
- `texture`

Fixation images are generated only when detected on the product:

- `multi-fonction`
- `passe-tringle`
- `galon-fronceur-crochets-escargot`
- `oeillets`
- `plis-flamands-agrafes-flamandes`

Output filenames use fixed numbering:

```text
output/downloads/product-handle/
product-handle_01_situation.jpg
product-handle_02_closeup.jpg
product-handle_03_texture.jpg
product-handle_04_multi-fonction.jpg
product-handle_05_passe-tringle.jpg
product-handle_06_galon-fronceur-crochets-escargot.jpg
product-handle_07_oeillets.jpg
product-handle_08_plis-flamands-agrafes-flamandes.jpg
```

## Safety Rules

- approved products have their Shopify media gallery replaced by generated images
- no price, stock, variant, status, or description updates
