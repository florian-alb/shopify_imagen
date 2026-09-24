"use node"

import { createHash } from "node:crypto"
import type { Doc } from "../_generated/dataModel"
import {
  bucketFor,
  mergeLinks,
  safeKey,
  prepareProduct,
  BUCKET_COUNT,
  PRODUCT_BATCH_SIZE,
  validateStructureBudget,
  type ProductLink,
  type CatalogProduct,
  type Preparation,
  type ProductOverride,
  type TaskInput,
  type TaskSpec,
} from "./model"
import {
  extractMenu,
  extractCollection,
  extractSitemap,
  extractProduct,
} from "./extract"
import { fetchPublic, renderedHtml, CollectionHttpError } from "./network"
import {
  getJson,
  getText,
  putJson,
  putText,
  listKeys,
  startMultipart,
  uploadPart,
  finishMultipart,
  objectExists,
} from "./storage"

export type Outcome = {
  tasks: TaskSpec[]
  complete: boolean
  inputKey?: string
  preparationKey?: string
  total?: number
  done?: number
  failed?: number
  finalKey?: string
  selecting?: boolean
}
export const digest = (s: string) =>
  createHash("sha256").update(s).digest("hex").slice(0, 24)
export const productPath = (root: string, handle: string) =>
  `${root}/products/${safeKey(handle)}.json`
export async function readOverride(
  prep: Preparation,
  handle: string,
): Promise<ProductOverride> {
  const key = prep.overrideBuckets?.[String(bucketFor(handle))]
  return key
    ? ((await getJson<Record<string, ProductOverride>>(key))?.[handle] ?? {})
    : {}
}
export async function preparation(
  op: Doc<"catalogOperations">,
  enrich = false,
) {
  const value = op.preparationKey
    ? await getJson<Preparation>(op.preparationKey)
    : null
  if (!value) throw new Error("Préparation du catalogue introuvable.")
  // Collection metadata is collected after the initial preparation; enrich without discarding edits.
  if (enrich && op.type === "export")
    for (let i = 0; i < value.collections.length; i += 20) {
      await Promise.all(
        value.collections.slice(i, i + 20).map(async (c) => {
          const detail = await getJson<Partial<typeof c>>(
            `${op.root}/collection-details/${safeKey(c.key)}.json`,
          )
          if (detail)
            for (const field of [
              "description",
              "seoTitle",
              "seoDescription",
              "image",
            ] as const) {
              if (!c[field] && detail[field]) c[field] = detail[field]!
            }
        }),
      )
    }
  return value
}
export async function spec(
  root: string,
  key: string,
  kind: TaskSpec["kind"],
  input: TaskInput,
): Promise<TaskSpec> {
  const inputKey = `${root}/inputs/${safeKey(key)}-${digest(JSON.stringify(input))}.json`
  await putJson(inputKey, input)
  return { key, kind, inputKey }
}
async function mergeDiscovery(root: string, products: ProductLink[]) {
  const groups = new Map<number, ProductLink[]>()
  for (const product of products) {
    const b = bucketFor(product.handle)
    groups.set(b, [...(groups.get(b) ?? []), product])
  }
  for (const [bucket, links] of groups) {
    const key = `${root}/indexes/discovery/${bucket}.json`
    const previous = (await getJson<ProductLink[]>(key)) ?? []
    await putJson(key, mergeLinks(previous, links))
  }
}
async function htmlWithFallback(url: string, parse: (html: string) => unknown) {
  const html = await fetchPublic(url)
  try {
    parse(html)
    return html
  } catch (error) {
    if (
      !process.env.CATALOG_BROWSERLESS_URL ||
      !process.env.CATALOG_BROWSERLESS_TOKEN
    )
      throw Object.assign(
        new Error(
          `Lecture HTML impossible pour ${url} : ${error instanceof Error ? error.message : "contenu non reconnu"}. Vérifiez l’extraction du thème ; un navigateur n’est pas nécessairement requis.`,
        ),
        { cause: error },
      )
    return renderedHtml(url)
  }
}

export async function runExportTask(
  op: Doc<"catalogOperations">,
  task: Doc<"catalogTasks">,
): Promise<Outcome> {
  const input = task.inputKey
    ? ((await getJson<TaskInput>(task.inputKey)) ?? {})
    : {}
  const root = op.root
  if (task.kind === "menu") {
    const html = await htmlWithFallback(op.origin, (h) =>
      extractMenu(h, op.origin),
    )
    const menu = extractMenu(html, op.origin)
    validateStructureBudget(menu)
    const key = `${root}/preparation/0.json`
    await putText(`${root}/raw/menu.html`, html, "text/html")
    await putJson(key, { ...menu, revision: 0 })
    return { complete: true, tasks: [], preparationKey: key, selecting: true }
  }
  if (task.kind === "discover") {
    const prep = await preparation(op)
    const selected = prep.collections.filter((c) => c.selected && c.url)
    const offset = Number(input.cursor ?? 0)
    const tasks: TaskSpec[] = []
    for (const c of selected.slice(offset, offset + 50))
      tasks.push(
        await spec(root, `collection-${c.key}-1`, "collection", {
          url: c.url,
          collection: c.key,
          page: 1,
        }),
      )
    if (offset + 50 < selected.length)
      tasks.push(
        await spec(root, `discover-${offset + 50}`, "discover", {
          cursor: String(offset + 50),
        }),
      )
    if (!offset && op.mode === "all")
      tasks.push(
        await spec(root, "sitemap-root", "sitemap", {
          url: `${op.origin}/sitemap.xml`,
        }),
      )
    return { complete: true, tasks }
  }
  if (task.kind === "collection") {
    const url = input.url!
    const key = input.collection!
    const html = await htmlWithFallback(url, (h) =>
      extractCollection(h, url, op.origin),
    )
    const result = extractCollection(html, url, op.origin)
    const fingerprint = digest(result.products.map((p) => p.handle).join(","))
    if ((input.seen ?? []).includes(fingerprint))
      throw new Error(
        "Boucle de pagination détectée ; vérifiez cette collection.",
      )
    await mergeDiscovery(
      root,
      result.products.map((p) => ({ ...p, collections: [key] })),
    )
    await putJson(`${root}/discovery/${safeKey(key)}/${input.page ?? 1}.json`, {
      ...result,
      collectedAt: Date.now(),
    })
    if ((input.page ?? 1) === 1)
      await putJson(
        `${root}/collection-details/${safeKey(key)}.json`,
        result.details,
      )
    const tasks: TaskSpec[] = []
    if (result.nextUrl) {
      const next = new URL(result.nextUrl)
      if (
        next.origin !== new URL(url).origin ||
        next.pathname !== new URL(url).pathname
      )
        throw new Error("La pagination quitte la collection source.")
      if ((input.page ?? 1) >= 5000)
        throw new Error("Pagination trop longue ; sauvegarde conservée.")
      tasks.push(
        await spec(
          root,
          `collection-${key}-${(input.page ?? 1) + 1}`,
          "collection",
          {
            url: result.nextUrl,
            collection: key,
            page: (input.page ?? 1) + 1,
            seen: [...(input.seen ?? []), fingerprint],
          },
        ),
      )
    }
    return { complete: true, tasks }
  }
  if (task.kind === "sitemap") {
    const xml = await fetchPublic(input.url!)
    const result = extractSitemap(xml, op.origin)
    await mergeDiscovery(root, result.products)
    const tasks: TaskSpec[] = []
    for (const map of result.maps) {
      const u = new URL(map)
      if (
        u.origin !== new URL(op.origin).origin ||
        !(u.pathname.includes("product") || u.pathname.endsWith("sitemap.xml"))
      )
        continue
      tasks.push(
        await spec(root, `sitemap-${digest(map)}`, "sitemap", { url: map }),
      )
    }
    return { complete: true, tasks }
  }
  if (task.kind === "index") {
    const bucket = input.bucket ?? 0
    const products =
      (await getJson<ProductLink[]>(
        `${root}/indexes/discovery/${bucket}.json`,
      )) ?? []
    const tasks: TaskSpec[] = []
    for (let i = 0; i < products.length; i += PRODUCT_BATCH_SIZE)
      tasks.push(
        await spec(root, `products-${bucket}-${i}`, "products", {
          products: products.slice(i, i + PRODUCT_BATCH_SIZE),
        }),
      )
    if (bucket + 1 < BUCKET_COUNT)
      tasks.push(
        await spec(root, `index-${bucket + 1}`, "index", {
          bucket: bucket + 1,
        }),
      )
    return { complete: true, tasks, total: op.total + products.length }
  }
  if (task.kind === "products") {
    const products = input.products ?? []
    const start = Number(input.cursor ?? 0)
    const errors: string[] = []
    let done = 0
    let failed = 0
    let duplicates = 0
    for (const link of products.slice(start, start + 5)) {
      const itemReceipt = `${root}/product-checkpoints/${safeKey(task.key)}/${digest(task.inputKey)}/${safeKey(link.handle)}.json`
      let checkpoint = await getJson<{
        product: CatalogProduct
        done: number
        failed: number
        duplicate: number
      }>(itemReceipt)
      if (!checkpoint) {
        const path = `${root}/raw/${safeKey(link.handle)}`
        let json = await getJson<unknown>(`${path}/product.json`)
        let html = await getText(`${path}/page.html`)
        const failures: string[] = []
        if (!json) {
          try {
            json = JSON.parse(await fetchPublic(`${link.url}.json`))
            if (extractProduct(link, json, null).jsonStatus !== "complete")
              throw new Error("JSON produit absent.")
            await putJson(`${path}/product.json`, json)
          } catch (e) {
            json = null
            if (
              e instanceof CollectionHttpError &&
              [403, 429].includes(e.status)
            )
              throw e
            failures.push(`JSON : ${e instanceof Error ? e.message : "échec"}`)
          }
        }
        if (!html) {
          try {
            html = await fetchPublic(link.url)
            const parsed = extractProduct(link, json, html)
            if (
              parsed.htmlStatus !== "complete" ||
              (!parsed.sections.length &&
                /accordion|collapsible|collapsing/i.test(html) &&
                process.env.CATALOG_BROWSERLESS_URL)
            )
              html = await renderedHtml(link.url)
            if (extractProduct(link, json, html).htmlStatus !== "complete")
              throw new Error("Page produit non reconnue.")
            await putText(`${path}/page.html`, html, "text/html")
          } catch (e) {
            if (
              e instanceof CollectionHttpError &&
              [403, 429].includes(e.status)
            )
              throw e
            failures.push(`Page : ${e instanceof Error ? e.message : "échec"}`)
          }
        }
        const product = extractProduct(link, json, html, failures)
        // The numeric Shopify ID, not a title or SKU, resolves renamed handles and redirects.
        const identityKey = product.sourceId
          ? `${root}/identities/${safeKey(product.sourceId)}.json`
          : null
        const identity = identityKey
          ? await getJson<{ handle: string }>(identityKey)
          : null
        if (identity) product.handle = identity.handle
        const previous = await getJson<CatalogProduct>(
          productPath(root, product.handle),
        )
        if (previous)
          product.collections = [
            ...new Set([...previous.collections, ...product.collections]),
          ]
        const wasFailed = previous ? previous.errors.length > 0 : null
        const isFailed = product.errors.length > 0
        checkpoint = {
          product,
          done: Number(!isFailed) - Number(wasFailed === false),
          failed: Number(isFailed) - Number(wasFailed === true),
          duplicate: previous && !task.key.startsWith("retry-") ? 1 : 0,
        }
        // Persist deltas before overwriting the materialized view. Replays reuse the same checkpoint.
        await putJson(itemReceipt, checkpoint)
      }
      const { product } = checkpoint
      await putJson(productPath(root, product.handle), product)
      if (product.sourceId)
        await putJson(`${root}/identities/${safeKey(product.sourceId)}.json`, {
          handle: product.handle,
        })
      await putJson(`${root}/summaries/${safeKey(product.handle)}.json`, {
        handle: product.handle,
        title: product.title,
        collections: product.collections,
        sourceId: product.sourceId,
        image: product.images[0]?.url ?? null,
        variants: product.variants.length,
        partial: product.errors.length > 0,
        warnings: product.warnings.length,
      })
      for (const collection of product.collections)
        await putJson(
          `${root}/collection-index/${safeKey(collection)}/${safeKey(product.handle)}.json`,
          { handle: product.handle, title: product.title },
        )
      done += checkpoint.done
      failed += checkpoint.failed
      duplicates += checkpoint.duplicate
      errors.push(...product.errors.map((e) => `${product.handle}: ${e}`))
    }
    if (errors.length)
      await putJson(`${root}/errors/${safeKey(task.key)}-${start}.json`, errors)
    const complete = start + 5 >= products.length
    const next = complete
      ? undefined
      : await spec(root, task.key, "products", {
          ...input,
          cursor: String(start + 5),
        })
    return {
      complete,
      tasks: [],
      inputKey: next?.inputKey,
      done,
      failed,
      ...(duplicates ? { total: op.total - duplicates } : {}),
    }
  }
  if (task.kind === "assemble") return assemble(op, task, input)
  throw new Error(`Étape inconnue : ${task.kind}`)
}

async function assemble(
  op: Doc<"catalogOperations">,
  task: Doc<"catalogTasks">,
  input: TaskInput,
): Promise<Outcome> {
  const prep = await preparation(op, true)
  const key = `${op.root}/final/${op.revision}/catalogue.json`
  if (await objectExists(key))
    return { complete: true, tasks: [], finalKey: key }
  // Save upload ID separately so retrying after CreateMultipartUpload does not discard committed parts.
  const uploadState = `${op.root}/final/${op.revision}/upload.json`
  let uploadId =
    input.uploadId ?? (await getJson<{ id: string }>(uploadState))?.id
  if (!uploadId) {
    uploadId = await startMultipart(key)
    await putJson(uploadState, { id: uploadId })
  }
  await putJson(`${op.root}/final/${op.revision}/preparation.json`, prep)
  let body = input.started
    ? ""
    : JSON.stringify({
        schemaVersion: 1,
        source: op.origin,
        collectedAt: op.updatedAt,
        scope: op.mode,
        collections: prep.collections,
        menu: prep.menu,
        coverage: {
          discovered: op.total,
          complete: op.done,
          failed: op.failed,
          partial: input.partial ?? false,
        },
      }).slice(0, -1) + ',"products":['
  let cursor = input.cursor
  let count = input.count ?? 0
  let bytes = Buffer.byteLength(body)
  const deadline = Date.now() + 3 * 60_000
  let finished = false
  while (bytes < 8 * 1024 * 1024 && Date.now() < deadline) {
    const listing = await listKeys(`${op.root}/products/`, cursor, 25)
    for (const path of listing.keys) {
      const product = await getJson<CatalogProduct>(path)
      if (!product) throw new Error("Une fiche référencée a disparu de R2.")
      const override = await readOverride(prep, product.handle)
      const prepared = prepareProduct(product, prep.collections, override)
      await putJson(
        `${op.root}/final/${op.revision}/products/${safeKey(product.handle)}.json`,
        prepared,
      )
      const line = (count ? "," : "") + JSON.stringify(prepared)
      body += line
      bytes += Buffer.byteLength(line)
      count++
    }
    cursor = listing.cursor
    if (!cursor) {
      body += "]}"
      finished = true
      break
    }
  }
  // Non-final S3 parts must be >= 5 MiB. Keep an incomplete buffer privately for the next invocation.
  const pendingKey = `${op.root}/final/${op.revision}/pending-${digest(task.inputKey)}.txt`
  const previous = input.pendingKey
    ? ((await getText(input.pendingKey)) ?? "")
    : ""
  body = previous + body
  if (!finished && Buffer.byteLength(body) < 5 * 1024 * 1024) {
    await putText(pendingKey, body)
    const next = await spec(op.root, task.key, "assemble", {
      uploadId,
      part: input.part ?? 1,
      cursor,
      count,
      started: true,
      byteCount: Buffer.byteLength(body),
      pendingKey,
      partial: input.partial,
    })
    return { complete: false, inputKey: next.inputKey, tasks: [] }
  }
  await uploadPart(key, uploadId, input.part ?? 1, body)
  if (finished) {
    if (count !== op.done + op.failed)
      throw new Error(
        `Bilan incohérent : ${count} fiches pour ${op.done + op.failed} résultats. Relancez les lots en échec.`,
      )
    await finishMultipart(key, uploadId)
    await putJson(`${op.root}/final/${op.revision}/manifest.json`, {
      key,
      count,
      schemaVersion: 1,
      complete: op.failed === 0,
    })
    return { complete: true, tasks: [], finalKey: key }
  }
  const next = await spec(op.root, task.key, "assemble", {
    uploadId,
    part: (input.part ?? 1) + 1,
    cursor,
    count,
    started: true,
    partial: input.partial,
  })
  return { complete: false, inputKey: next.inputKey, tasks: [] }
}
