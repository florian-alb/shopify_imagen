# 🪟 Shopify Image Studio

Application **mobile-first** pour générer automatiquement des visuels produits Shopify (rideaux & voilages) avec **OpenAI Images** ou **Google Nano Banana Pro (Gemini)**, les optimiser en **WebP**, les stocker sur **Cloudflare R2**, les relire, puis les pousser dans Shopify — manuellement et en toute sécurité.

> Stack : **TanStack Start + React 19** (front) · **Convex** (backend temps réel, jobs, crons) · **Tailwind v4 + shadcn/ui** · **sharp** (traitement image) · **Shopify Admin GraphQL** · **Cloudflare R2**.
  
---

## ✨ Fonctionnalités

- 🔐 Pages protégées par **Convex Auth** (mot de passe).
- 🔄 Sync des produits Shopify actifs via l'**Admin GraphQL API** dans Convex.
- 🧠 Détection automatique des **fixations** (œillets, passe-tringle, plis flamands…) par normalisation + synonymes.
- 🎨 Génération par type d'image en **jobs background** avec progression temps réel — moteur OpenAI **ou** Gemini, au choix.
- ⚡ Deux modes : **temps réel** (immédiat) ou **batch** (asynchrone, ~50 % moins cher).
- 🖼️ Chaque image est convertie en **WebP optimisé**, **débarrassée de ses métadonnées** (EXIF/ICC/XMP) et **renommée SEO** (`rideau-lin-gris-situation-lifestyle.webp`).
- ☁️ Binaires stockés sur **R2** ; Convex ne garde que les URLs et métadonnées.
- 📤 Push vers Shopify **uniquement après confirmation explicite**, avec option de remplacement de la galerie.
- ✏️ Édition/réinitialisation des templates de prompts dans `/settings/prompts`.

---

## 🗂️ Architecture

```
app/                TanStack Start — routes & UI React
  routes/           /login, /products, /products/$id, /jobs, /settings…
  components/ui/    composants shadcn/ui
convex/             Backend Convex
  schema.ts         tables (products, generatedImages, generationJobs…)
  shopify.ts        sync produits + push images (actions)
  generation.ts     génération image, optimisation WebP, upload R2, batch
  jobs.ts           cycle de vie des jobs & images
  crons.ts          poll des batches toutes les 2 min
  lib.ts            normalisation, détection fixations, slug SEO
prompts/            templates de prompts par type d'image
scripts/            scripts de maintenance ponctuels (ex. switch_images.js)
src/                ⚠️ ancien CLI local (legacy, conservé pour référence)
convex.json         déclare `sharp` en external package (binaire natif)
```

---

## ✅ Prérequis

- **Node.js ≥ 20.6** (testé sur 25). `--env-file` natif est utilisé par certains scripts.
- Un compte **Convex**, des clés **OpenAI** et/ou **Gemini**, une app **Shopify** (client credentials) et un bucket **Cloudflare R2** public.

---

## 🚀 Setup

```bash
# 1. Dépendances
npm install

# 2. Variables d'environnement
cp .env.example .env
#    → remplis les valeurs (voir section Environnement)

# 3. Lier / créer le déploiement Convex
#    (renseigne CONVEX_DEPLOYMENT + VITE_CONVEX_URL, pousse le schéma,
#     les fonctions ET les crons, installe sharp côté serveur)
npx convex dev
```

> 🔑 **Indispensable :** ajoute aussi les secrets serveur (`OPENAI_API_KEY`, `GEMINI_API_KEY`, `SHOPIFY_*`, `R2_*`) à **l'environnement du déploiement Convex** (dashboard Convex → Settings → Environment Variables), pas seulement dans `.env`. Les actions Convex lisent leurs clés là, jamais depuis le navigateur.

### 🧪 Convex dev vs production

Ce projet utilise **deux projets Convex séparés** pour ne jamais faire tourner du développement local sur la base de données de production :

- **Dev** (local, `npx convex dev`) — ses identifiants de connexion (`CONVEX_DEPLOYMENT`, `VITE_CONVEX_URL`, `VITE_CONVEX_SITE_URL`) vivent dans **`.env.local`**, écrit automatiquement par la CLI Convex et ignoré par git. Ne mets jamais ces clés dans `.env`.
- **Production** (Vercel) — son `CONVEX_DEPLOY_KEY` est configuré uniquement dans les variables d'environnement Vercel, jamais en local (voir [DEPLOYMENT.md](DEPLOYMENT.md)).
- `.env` ne contient donc plus que les secrets serveur partagés (OpenAI, Gemini, Shopify, R2, auth) que tu pousses toi-même avec `npx convex env set` sur le déploiement actif.
- Par défaut, le projet Convex dev **n'a pas** les clés `SHOPIFY_*` / `R2_*` de prod — les actions Shopify/R2 échoueront tant que tu n'y ajoutes pas tes propres valeurs (idéalement une boutique/bucket de test). C'est volontaire pour éviter qu'un test local ne pousse une image sur la vraie boutique Shopify.

---

## ▶️ Lancer le projet

Deux process en parallèle :

```bash
# Terminal 1 — backend Convex (pousse le code à chaud + exécute les crons)
npm run convex:dev

# Terminal 2 — front TanStack Start / Vite
npm run dev
```

Ouvre l'URL affichée par Vite, généralement **http://localhost:5173**.

> ⚠️ **Garde `convex:dev` allumé en permanence pendant que tu travailles.** Sans lui : tes modifs de code backend ne partent pas **et les crons ne tournent pas** — les jobs batch restent alors bloqués et semblent « perdus ». Pour un déploiement ponctuel sans process persistant : `npx convex dev --once`.

---

## 🔐 Environnement

### Convex & Auth
| Variable                                  | Rôle                                                                            |
| ----------------------------------------- | ------------------------------------------------------------------------------- |
| `CONVEX_DEPLOYMENT`                       | déploiement Convex dev actif, **auto-écrit dans `.env.local`** par `convex dev` |
| `CONVEX_DEPLOY_KEY`                       | clé de déploiement (CI/Vercel uniquement, jamais en local)                      |
| `VITE_CONVEX_URL`, `VITE_CONVEX_SITE_URL` | URLs Convex côté client (seules variables `VITE_` exposées au navigateur)       |
| `AUTH_SECRET`, `AUTH_URL`, `SITE_URL`     | config Convex Auth                                                              |
| `JWT_PRIVATE_KEY`, `JWKS`                 | clés générées par la commande de setup Convex Auth                              |
| `AUTH_ADMIN_EMAIL`                        | adresse du premier compte admin approuvé                                        |
| `AUTH_SETUP_SECRET`                       | secret requis pour créer le premier admin                                       |

Les inscriptions suivantes créent des comptes `users.approvalStatus = "pending"`.
Un admin doit passer ce champ à `"approved"` dans le dashboard Convex pour autoriser l'accès.

### OpenAI Images
| Variable                           | Défaut                   |
| ---------------------------------- | ------------------------ |
| `OPENAI_API_KEY`                   | —                        |
| `OPENAI_IMAGE_MODEL`               | `gpt-image-2-2026-04-21` |
| `OPENAI_IMAGE_SIZE`                | `1024x1024`              |
| `OPENAI_IMAGE_QUALITY`             | `medium`                 |
| `OPENAI_IMAGE_OUTPUT_FORMAT`       | `jpeg`                   |
| `OPENAI_IMAGE_REQUESTS_PER_MINUTE` | `5`                      |

### Nano Banana Pro (Gemini)
| Variable                           | Défaut                                      |
| ---------------------------------- | ------------------------------------------- |
| `GEMINI_API_KEY`                   | —                                           |
| `GEMINI_IMAGE_MODEL`               | `gemini-3-pro-image-preview`                |
| `GEMINI_IMAGE_SIZE`                | `1K` \| `2K` \| `4K` (vide = défaut modèle) |
| `GEMINI_IMAGE_ASPECT_RATIO`        | ex. `1:1`, `4:3`, `16:9`                    |
| `GEMINI_IMAGE_REQUESTS_PER_MINUTE` | `5`                                         |

### Shopify Admin GraphQL
| Variable                                     | Défaut                                                                |
| -------------------------------------------- | --------------------------------------------------------------------- |
| `SHOPIFY_SHOP_DOMAIN`                        | `xxx.myshopify.com`                                                   |
| `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET` | client credentials de l'app                                           |
| `SHOPIFY_API_VERSION`                        | `2026-04`                                                             |
| `SHOPIFY_PRODUCT_QUERY`                      | `status:active,draft,archived` (ex. `status:active` pour restreindre) |

### Cloudflare R2
| Variable                                                    | Rôle                                                                    |
| ----------------------------------------------------------- | ----------------------------------------------------------------------- |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | credentials S3                                                          |
| `R2_BUCKET`                                                 | nom du bucket                                                           |
| `R2_PUBLIC_BASE_URL`                                        | **URL publique** du bucket (Shopify importe les images depuis ces URLs) |
| `WEBP_QUALITY`                                              | qualité WebP, défaut `82` (optionnel)                                   |

---

## 🧭 Workflow type

1. `/login` → crée le premier compte admin, puis connecte-toi.
2. `/settings/prompts` → crée ou ajuste les prompts à utiliser.
3. `/settings` → choisis **OpenAI Images** ou **Nano Banana Pro** + mode temps réel/batch.
4. `/products` → **Sync Shopify**.
5. Sélectionne des produits, coche les types d'images (preset budget : `situation`, `closeup`, `texture`, `oeillets`).
6. Lance le job → suis la progression dans `/jobs` ou `/products/$id`.
7. Inspecte les images générées, prompts et historique.
8. **Push** → confirme, et coche éventuellement « Replace existing » pour remplacer la galerie.

### Types d'images
Toujours disponibles : `situation`, `closeup`, `texture`.
Fixations (uniquement si détectées) : `multi-fonction`, `passe-tringle`, `galon-fronceur-crochets-escargot`, `oeillets`, `plis-flamands-agrafes-flamandes`.

---

## 🖼️ Pipeline image

À l'enregistrement (avant tout push), dans `convex/generation.ts` :

1. **WebP** — ré-encodage via `sharp` (qualité `WEBP_QUALITY`, défaut 82).
2. **Strip métadonnées** — sharp ne recopie ni EXIF, ni ICC, ni XMP (`.rotate()` applique puis supprime l'orientation).
3. **Nommage SEO** — clé R2 `generated/<handle>/<id>/<titre-produit>-<type>.webp`, le dernier segment (propre) devenant le nom du média côté Shopify.

> `sharp` est un binaire natif : il est déclaré dans `convex.json` (`node.externalPackages`) pour que Convex l'installe côté serveur Linux au lieu de le bundler. Si tu retires ce fichier, le pipeline retombe sur les octets d'origine (pas de WebP).

---

## ⚙️ Modes de génération

| Mode           | Comportement                                                                                                                                                                                                                                                                                                                              |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Temps réel** | `generation.processJob` génère séquentiellement avec rate-limit ; résultats immédiats.                                                                                                                                                                                                                                                    |
| **Batch**      | `generation.submitBatch` soumet un lot au provider (~50 % moins cher, asynchrone). Pour Gemini, les requêtes et résultats transitent par des fichiers JSONL afin de streamer les images sans dépasser la mémoire Convex. Le cron **`poll image batches`** (`convex/crons.ts`, toutes les 2 min) récupère les résultats et termine le job. |

Architecture détaillée et récupération des anciens batches Gemini inline :
[`docs/GEMINI_BATCH.md`](docs/GEMINI_BATCH.md).

Suivi des jobs batch :
```bash
npx convex data generationJobs          # status: running | completed | failed
npx convex run generation:pollBatches '{}'   # forcer un poll immédiat
```

---

## 📤 Push & re-push vers Shopify

- Le push (`convex/shopify.ts › pushProductImages`) envoie les images `generated` **et** `uploaded` (re-push autorisé, ex. après passage en WebP).
- **Sans** « Replace existing » : les nouvelles images **s'ajoutent** (doublons possibles).
- **Avec** « Replace existing » : les anciens médias (matchés par `alt`) sont remplacés.

Flux « tout repasser en WebP » : régénérer (force) → push avec *Replace existing*.

---

## 🧯 Dépannage

| Symptôme                                            | Cause / solution                                                                                                                                                                                                    |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Variable d'environnement manquante` dans un script | le `.env` n'est pas chargé → lancer via `node --env-file=.env …` (déjà câblé dans `images_switch`).                                                                                                                 |
| `Could not find MIME for Buffer` à la génération    | ancien code (jimp, sans codec WebP) encore déployé → relancer `convex:dev` / `npx convex dev --once`.                                                                                                               |
| Image stockée en `.jpg` au lieu de `.webp`          | `sharp` n'a pas chargé côté Convex → vérifier `convex.json` puis redéployer.                                                                                                                                        |
| Jobs batch bloqués en `running` / « perdus »        | Vérifier que `convex:dev` tourne, puis lancer `npx convex run generation:pollBatches '{}'`. Les anciens batches Gemini inline sont récupérés progressivement ; voir [`docs/GEMINI_BATCH.md`](docs/GEMINI_BATCH.md). |

---

## 🔎 Validation

```bash
npm run typecheck                 # tsc app
npx tsc --noEmit -p convex/tsconfig.json   # fonctions Convex
npm run build
npx convex dev --once             # régénère _generated, typecheck & push Convex
```

---

## ☁️ Déploiement (Vercel + Convex)

1. Crée/lie le déploiement Convex.
2. Renseigne les variables sur Vercel **et** dans l'environnement Convex (secrets côté Convex uniquement).
3. `npx convex deploy` pour pousser les fonctions et les crons.
4. `npm run build` puis déploie l'app sur Vercel.

> Garde OpenAI / Gemini / Shopify / R2 **hors** des variables `VITE_`. Seul `VITE_CONVEX_URL` est visible côté navigateur.

---

## 📦 Legacy CLI

L'ancienne automatisation locale reste dans `src/` pour référence :

```bash
npm run dry-run -- --limit=1
npm run export-images -- --limit=10
npm run generate -- --limit=10
npm run attach-images -- --limit=10
npm run review -- --limit=10
```

---

## 🔒 Sécurité

- Les clés OpenAI/Gemini/Shopify/R2 ne sont lues que par les actions Convex, jamais dans le bundle navigateur.
- Prix, stock, variantes, descriptions et statut Shopify ne sont **jamais** modifiés.
- Aucune image n'est poussée automatiquement après génération.
- Les images Shopify existantes ne sont supprimées **que** sur confirmation explicite du remplacement.
</content>
</invoke>
