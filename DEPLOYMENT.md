# Deploying to Vercel

This app has two halves:

- **Web app** (TanStack Start) → hosted on **Vercel**.
- **Backend** (Convex: queries, mutations, actions, auth, image generation,
  Shopify, R2) → hosted on **Convex Cloud**.

Almost every secret (OpenAI, Gemini, Shopify, R2, auth keys) lives on the
**Convex** deployment, not on Vercel. The only thing Vercel needs is a Convex
**deploy key** so its build can push the Convex functions and learn the
production Convex URL.

The web app is already mobile-friendly (bottom nav on phones), so once it's
online you can generate from your phone.

---

## 1. Create the Convex production deployment

From the [Convex dashboard](https://dashboard.convex.dev) open this project
(`shopify-imagen`) and switch to / create the **Production** deployment.

Then copy every backend env var from your dev deployment to prod. The backend
needs these (current dev set):

```
# AI providers
OPENAI_API_KEY, OPENAI_IMAGE_MODEL, OPENAI_IMAGE_SIZE, OPENAI_IMAGE_QUALITY,
OPENAI_IMAGE_OUTPUT_FORMAT, OPENAI_IMAGE_REQUESTS_PER_MINUTE, GENERATION_CONCURRENCY
GEMINI_API_KEY, GEMINI_IMAGE_MODEL, GEMINI_IMAGE_REQUESTS_PER_MINUTE

# Shopify
SHOPIFY_SHOP_DOMAIN, SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET,
SHOPIFY_API_VERSION, SHOPIFY_PRODUCT_QUERY

# Cloudflare R2 storage
R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET,
R2_PUBLIC_BASE_URL, R2_TOKEN

# Auth (Convex Auth)
JWT_PRIVATE_KEY, JWKS, SITE_URL
```

Set them from the dashboard (Settings → Environment Variables) or via CLI, e.g.:

```bash
npx convex env set OPENAI_API_KEY "sk-..." --prod
# ...repeat for each var
```

Notes:
- `SITE_URL` should be your **Vercel production URL** (e.g.
  `https://your-app.vercel.app`). You can set a placeholder now and fix it after
  the first deploy gives you the real domain (see step 4).
- For the auth keys (`JWT_PRIVATE_KEY` / `JWKS`), you can reuse the dev values or
  generate fresh ones for prod with:
  ```bash
  npx @convex-dev/auth --prod
  ```
  (This also sets `SITE_URL`.)

## 2. Get a Convex production deploy key

Convex dashboard → **Settings → Deploy Keys** (Production) → **Generate
Production Deploy Key**. Copy it.

## 3. Create the Vercel project

1. Import this Git repo in Vercel.
2. **Framework Preset:** "TanStack Start" (also pinned in `vercel.json`).
   The output directory is pinned to `.vercel/output`, the Vercel Build Output
   API format that Nitro emits automatically.
3. **Environment Variables** → add (Production scope):
   ```
   CONVEX_DEPLOY_KEY = <the production deploy key from step 2>
   ```
   That's the only env var Vercel needs. `VITE_CONVEX_URL` is injected
   automatically by `convex deploy` during the build.

The build command (already committed in `vercel.json`) is:

```bash
npx convex deploy --cmd-url-env-var-name VITE_CONVEX_URL --cmd 'npm run build'
```

This deploys the Convex functions/schema to prod, then runs the web build with
the production `VITE_CONVEX_URL` baked in.

## 4. Deploy, then fix SITE_URL

1. Trigger the first Vercel deploy. Note the production domain it gives you.
2. Set `SITE_URL` on the Convex **prod** deployment to that exact domain
   (no trailing slash):
   ```bash
   npx convex env set SITE_URL "https://your-app.vercel.app" --prod
   ```
3. If you later add a custom domain, update `SITE_URL` again.

## 5. First login

The app uses Convex Auth with email/password. On first visit go to `/login` and
register — the profile is created with `role: "admin"`. Default prompt templates
auto-seed on first load of the Prompts page.

---

## Local development (unchanged)

```bash
npm run dev            # web app
npx convex dev         # backend (separate terminal)
```

Local `npm run build` still produces a Node server at `.output/server/index.mjs`
(run with `npm start`); the Vercel output format is only produced when the
`VERCEL` env var is present (i.e. on Vercel's build machines).
