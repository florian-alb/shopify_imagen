"use node"

import { load } from "cheerio"
import type { ActionCtx } from "../_generated/server"
import type { Doc } from "../_generated/dataModel"
import { internal } from "../_generated/api"
import { shopifyGraphql } from "../shopify/client"
import {
  shopifyCredentialsForShop,
  type ShopifyCredentials,
} from "../shopScope"
import {
  type CatalogProduct,
  type Preparation,
  type MenuNode,
  type CollectionPlan,
  type TaskInput,
  prepareProduct,
  matchesCollection,
  externalId,
  safeKey,
} from "./model"
import {
  digest,
  preparation,
  readOverride,
  spec,
  type Outcome,
} from "./pipeline"
import { getJson, putJson, listKeys } from "./storage"
import { importDescription, cleanHtml } from "./extract"
import * as gql from "./graphql"

type Errors = Array<{ message: string; code?: string }>
type Mapping = { id: string; handle: string }
type ProductMedia = {
  id: string
  status: string
  originalSource?: { url: string | null } | null
}
export function mediaRetryInputs(
  media: ProductMedia[],
  files: Array<{ originalSource: string }>,
) {
  return media.flatMap((item) => {
    const matches = files.filter(
      (file) => file.originalSource === item.originalSource?.url,
    )
    // Shopify may reorder media. Never infer a source from the array position.
    return item.status === "FAILED" && matches.length === 1
      ? [{ id: item.id, originalSource: matches[0].originalSource }]
      : []
  })
}
export type ImportState = {
  collections: Record<string, Mapping>
  domain: string
  currency: string
}
function check(errors: Errors | undefined) {
  if (errors?.length) throw new Error(errors.map((e) => e.message).join(" · "))
}
export async function diagnoseShop(shop: Doc<"shops">) {
  const r = await shopifyGraphql<{
    currentAppInstallation: { accessScopes: Array<{ handle: string }> }
    shop: { currencyCode: string; primaryDomain: { url: string } }
  }>(gql.DIAGNOSTIC, {}, undefined, shopifyCredentialsForShop(shop))
  const granted = r.currentAppInstallation.accessScopes.map((s) => s.handle)
  return {
    missing: [
      "write_products",
      "write_files",
      "write_online_store_navigation",
    ].filter((s) => !granted.includes(s)),
    currency: r.shop.currencyCode,
    domain: r.shop.primaryDomain.url,
  }
}
export function uniqueIdentifier(origin: string, id: string) {
  return {
    namespace: "imagen_catalog",
    key: "source_id",
    value: externalId(origin, id),
  }
}
export function productInput(
  product: ReturnType<typeof prepareProduct>,
  origin: string,
  description: string,
) {
  if (
    !product.sourceId ||
    product.jsonStatus !== "complete" ||
    product.htmlStatus !== "complete"
  )
    throw new Error(`Fiche incomplète : ${product.title}`)
  if (product.variants.length > 2048)
    throw new Error(`Trop de variantes : ${product.title}`)
  return {
    title: product.title,
    handle: product.handle,
    descriptionHtml: description,
    status: "DRAFT",
    tags: product.tags,
    vendor: product.vendor,
    productType: product.productType,
    seo: {
      title: product.seo.title || product.title,
      description: product.seo.description,
    },
    productOptions: product.options.map((o, i) => ({
      name: o.name,
      position: i + 1,
      values: o.values.map((name) => ({ name })),
    })),
    variants: product.variants.map((v) => ({
      price: v.price,
      ...(v.compareAtPrice ? { compareAtPrice: v.compareAtPrice } : {}),
      sku: v.sku,
      optionValues: v.options.map((name, i) => ({
        optionName: product.options[i]?.name ?? "Title",
        name,
      })),
      inventoryItem: {
        tracked: false,
        requiresShipping: true,
        measurement: {
          weight: {
            value: v.weight,
            unit:
              (
                {
                  kg: "KILOGRAMS",
                  g: "GRAMS",
                  lb: "POUNDS",
                  oz: "OUNCES",
                } as Record<string, string>
              )[v.weightUnit] ?? "KILOGRAMS",
          },
        },
      },
      ...(v.imageId && product.images.find((img) => img.id === v.imageId)
        ? {
            file: {
              originalSource: product.images.find(
                (img) => img.id === v.imageId,
              )!.url,
            },
          }
        : {}),
    })),
    files: product.images.map((img) => ({
      originalSource: img.url,
      alt: img.alt,
      contentType: "IMAGE",
    })),
    metafields: [
      {
        ...uniqueIdentifier(origin, product.sourceId),
        type: "single_line_text_field",
      },
    ],
  }
}
export function targetMenu(
  items: MenuNode[],
  origin: string,
  state: ImportState,
  selected: Set<string>,
  depth = 1,
): unknown[] {
  return items.flatMap((item) => {
    if (depth > 3)
      throw new Error(
        "Le menu dépasse trois niveaux. Corrigez sa structure avant import.",
      )
    const children = targetMenu(
      item.children,
      origin,
      state,
      selected,
      depth + 1,
    )
    const path = item.url ? new URL(item.url).pathname : ""
    const handle = path.match(/\/collections\/([^/]+)/)?.[1]
    if (handle) {
      if (
        !selected.has(decodeURIComponent(handle)) ||
        !state.collections[decodeURIComponent(handle)]
      )
        return children
      return [
        {
          title: item.title,
          type: "COLLECTION",
          resourceId: state.collections[decodeURIComponent(handle)].id,
          items: children,
        },
      ]
    }
    if (!item.url)
      return children.length
        ? [
            {
              title: item.title,
              type: "HTTP",
              url: `${state.domain}/collections/all`,
              items: children,
            },
          ]
        : []
    if (
      new URL(item.url).hostname.replace(/^www\./, "") ===
      new URL(origin).hostname.replace(/^www\./, "")
    ) {
      // Source pages/products outside this import are not silently linked back to the competitor.
      return children
    }
    return [{ title: item.title, type: "HTTP", url: item.url, items: children }]
  })
}
export async function remapDescription(
  product: CatalogProduct,
  origin: string,
  state: ImportState,
  resolveProduct?: (handle: string) => Promise<Mapping | null>,
) {
  const $ = load(importDescription(product), null, false)
  const unresolved: string[] = []
  for (const el of $("a[href]").toArray()) {
    const link = $(el)
    const href = link.attr("href")!
    try {
      const u = new URL(href, origin)
      if (
        u.hostname.replace(/^www\./, "") !==
        new URL(origin).hostname.replace(/^www\./, "")
      )
        continue
      const collectionKey = decodeURIComponent(
        u.pathname.match(/\/collections\/([^/]+)\/?$/)?.[1] ?? "",
      )
      const productKey = decodeURIComponent(
        u.pathname.match(/\/products\/([^/]+)\/?$/)?.[1] ?? "",
      )
      const destination = collectionKey
        ? state.collections[collectionKey]
        : productKey && resolveProduct
          ? await resolveProduct(productKey)
          : null
      if (destination)
        link.attr(
          "href",
          `${state.domain}/${collectionKey ? "collections" : "products"}/${destination.handle}${u.hash}`,
        )
      else {
        unresolved.push(href)
        link.removeAttr("href")
      }
    } catch {
      unresolved.push(href)
      link.removeAttr("href")
    }
  }
  return { html: cleanHtml($.html()), unresolved: [...new Set(unresolved)] }
}

async function ensureDefinition(credentials: ShopifyCredentials) {
  const result = await shopifyGraphql<{
    metafieldDefinitions: {
      nodes: Array<{
        id: string
        type: { name: string }
        capabilities: { uniqueValues: { enabled: boolean } }
      }>
    }
  }>(gql.DEFINITIONS, { ownerType: "PRODUCT" }, undefined, credentials)
  const existing = result.metafieldDefinitions.nodes[0]
  if (existing) {
    if (
      existing.type.name !== "single_line_text_field" ||
      !existing.capabilities.uniqueValues.enabled
    )
      throw new Error(
        "Le champ imagen_catalog.source_id existe sans unicité. Corrigez sa définition avant import.",
      )
    return
  }
  // Merchant-owned identity deliberately survives changing the connected custom app.
  const created = await shopifyGraphql<{
    metafieldDefinitionCreate: { userErrors: Errors }
  }>(
    gql.DEFINITION,
    {
      definition: {
        name: "Identifiant source Imagen",
        namespace: "imagen_catalog",
        key: "source_id",
        type: "single_line_text_field",
        ownerType: "PRODUCT",
        capabilities: { uniqueValues: { enabled: true } },
      },
    },
    undefined,
    credentials,
  )
  check(created.metafieldDefinitionCreate.userErrors)
}

export async function runImportTask(
  ctx: ActionCtx,
  op: Doc<"catalogOperations">,
  task: Doc<"catalogTasks">,
): Promise<Outcome> {
  const shop: Doc<"shops"> = await ctx.runQuery(
    internal.catalogImport.importShop,
    { shopId: op.shopId!, owner: op.ownerId },
  )
  const credentials = shopifyCredentialsForShop(shop)
  const prep = await preparation(op)
  const selected = prep.collections.filter((c) => op.selection?.includes(c.key))
  const source: Doc<"catalogOperations"> = await ctx.runQuery(
    internal.catalogImport.context,
    { id: op.sourceExportId!, owner: op.ownerId },
  )
  const input = task.inputKey
    ? ((await getJson<TaskInput>(task.inputKey)) ?? {})
    : {}
  if (task.kind === "importSetup") {
    const diagnostic = await diagnoseShop(shop)
    if (diagnostic.missing.length)
      throw new Error(
        `Autorisations manquantes : ${diagnostic.missing.join(", ")}`,
      )
    await ensureDefinition(credentials)
    const state = (await getJson<ImportState>(`${op.root}/state.json`)) ?? {
      collections: {},
      domain: diagnostic.domain,
      currency: diagnostic.currency,
    }
    const start = Number(input.cursor ?? 0)
    for (const plan of selected.slice(start, start + 10)) {
      if (state.collections[plan.key]) continue
      const handle = `${plan.key.slice(0, 120)}-${digest(JSON.stringify([op.origin, plan.key, plan.tags, plan.match])).slice(0, 8)}`
      const marker = `${externalId(op.origin, plan.key)}:${digest(JSON.stringify([plan.tags, plan.match]))}`
      const found = await shopifyGraphql<{
        collections: {
          nodes: Array<Mapping & { metafield: { value: string } | null }>
        }
      }>(gql.COLLECTIONS, { query: `handle:${handle}` }, undefined, credentials)
      let collection:
        | (Mapping & { metafield?: { value: string } | null })
        | undefined = found.collections.nodes.find((c) => c.handle === handle)
      if (collection && collection.metafield?.value !== marker)
        throw new Error(
          `Le handle ${handle} appartient à une collection étrangère à cet import.`,
        )
      if (!collection) {
        const result = await shopifyGraphql<{
          collectionCreate: {
            collection:
              | (Mapping & { metafield?: { value: string } | null })
              | null
            userErrors: Errors
          }
        }>(
          gql.COLLECTION_CREATE,
          {
            input: {
              title: plan.targetTitle,
              handle,
              descriptionHtml: cleanHtml(plan.description),
              ...(plan.image ? { image: { src: plan.image } } : {}),
              metafields: [
                {
                  namespace: "imagen_catalog",
                  key: "source_id",
                  type: "single_line_text_field",
                  value: marker,
                },
              ],
              seo: {
                title: plan.seoTitle || plan.targetTitle,
                description: plan.seoDescription,
              },
              ruleSet: {
                appliedDisjunctively: plan.match === "any",
                rules: plan.tags.map((condition) => ({
                  column: "TAG",
                  relation: "EQUALS",
                  condition,
                })),
              },
            },
          },
          undefined,
          credentials,
        )
        check(result.collectionCreate.userErrors)
        collection = result.collectionCreate.collection ?? undefined
      }
      if (!collection) throw new Error("Création de collection non confirmée.")
      state.collections[plan.key] = collection
      await putJson(`${op.root}/state.json`, state)
    }
    if (start + 10 < selected.length)
      return {
        complete: false,
        tasks: [],
        inputKey: (
          await spec(op.root, task.key, "importSetup", {
            cursor: String(start + 10),
          })
        ).inputKey,
      }
    targetMenu(prep.menu, op.origin, state, new Set(op.selection))
    return {
      complete: true,
      tasks: [
        await spec(op.root, "import-products-start", "importProducts", {}),
      ],
    }
  }
  if (task.kind === "importProducts")
    return importProducts(
      op,
      task,
      input,
      prep,
      selected,
      op.sourceSnapshot ?? `${source.root}/final/${op.revision}`,
      credentials,
    )
  if (task.kind === "importLinks") {
    const state = await getJson<ImportState>(`${op.root}/state.json`)
    if (!state) throw new Error("Correspondances absentes.")
    const listing = await listKeys(
      `${op.sourceSnapshot}/products/`,
      input.cursor,
      10,
    )
    for (const key of listing.keys) {
      const product = await getJson<CatalogProduct>(key)
      if (!product?.sourceId) continue
      const mapping = await getJson<Mapping & { created?: boolean }>(
        `${op.root}/mappings/${product.sourceId}.json`,
      )
      if (!mapping?.created) continue
      const rewritten = await remapDescription(
        product,
        op.origin,
        state,
        (handle) =>
          getJson<Mapping>(`${op.root}/handles/${safeKey(handle)}.json`),
      )
      const result = await shopifyGraphql<{
        productUpdate: { userErrors: Errors }
      }>(
        gql.DESCRIPTION_UPDATE,
        { product: { id: mapping.id, descriptionHtml: rewritten.html } },
        undefined,
        credentials,
      )
      check(result.productUpdate.userErrors)
      if (rewritten.unresolved.length)
        await putJson(
          `${op.root}/errors/${safeKey(product.handle)}-links.json`,
          {
            handle: product.handle,
            error: `Liens internes non résolus, retirés de la description : ${rewritten.unresolved.slice(0, 30).join(", ")}`,
          },
        )
    }
    if (listing.cursor)
      return {
        complete: false,
        tasks: [],
        inputKey: (
          await spec(op.root, task.key, "importLinks", {
            cursor: listing.cursor,
          })
        ).inputKey,
      }
    return {
      complete: true,
      tasks: [await spec(op.root, "import-finish", "importFinish", {})],
    }
  }
  if (task.kind === "importFinish") {
    const state = await getJson<ImportState>(`${op.root}/state.json`)
    if (!state) throw new Error("Correspondances de collections absentes.")
    const handle = `imagen-import-${digest(`${op.origin}:${op._id}`).slice(0, 12)}`
    const existing = await shopifyGraphql<{ menus: { nodes: Mapping[] } }>(
      gql.MENUS,
      { query: `handle:${handle}` },
      undefined,
      credentials,
    )
    let menu = existing.menus.nodes.find((m) => m.handle === handle)
    if (!menu) {
      const r = await shopifyGraphql<{
        menuCreate: { menu: Mapping | null; userErrors: Errors }
      }>(
        gql.MENU_CREATE,
        {
          title: `Import ${new URL(op.origin).hostname}`,
          handle,
          items: targetMenu(prep.menu, op.origin, state, new Set(op.selection)),
        },
        undefined,
        credentials,
      )
      check(r.menuCreate.userErrors)
      menu = r.menuCreate.menu ?? undefined
    }
    if (!menu) throw new Error("Menu non confirmé.")
    await putJson(`${op.root}/result.json`, {
      menu,
      collections: state.collections,
      products: op.done,
      failed: op.failed,
      status: "draft",
      themeAssignment: "manual",
    })
    return { complete: true, tasks: [], total: op.done + op.failed }
  }
  throw new Error("Étape d’import inconnue.")
}

async function importProducts(
  op: Doc<"catalogOperations">,
  task: Doc<"catalogTasks">,
  input: TaskInput,
  prep: Preparation,
  plans: CollectionPlan[],
  sourceRoot: string,
  credentials: ShopifyCredentials,
): Promise<Outcome> {
  const state = await getJson<ImportState>(`${op.root}/state.json`)
  if (!state) throw new Error("Import non préparé.")
  const batchKey = `${op.root}/bulk/${safeKey(task.key)}`
  let batch = await getJson<{
    lines: Array<{
      handle: string
      sourceId: string
      input: unknown
      identifier: unknown
    }>
    next?: string
    existing: number
    failed: number
    bulkId?: string
    submitted?: boolean
    submittedAt?: number
  }>(`${batchKey}.json`)
  if (!batch) {
    const listing = await listKeys(`${sourceRoot}/products/`, input.cursor, 25)
    batch = { lines: [], next: listing.cursor, existing: 0, failed: 0 }
    for (const key of listing.keys) {
      const raw = await getJson<CatalogProduct>(key)
      if (!raw) continue
      const p = prepareProduct(
        raw,
        prep.collections,
        await readOverride(prep, raw.handle),
      )
      if (p.excluded || !plans.some((c) => matchesCollection(p.tags, c)))
        continue
      if (
        !p.sourceId ||
        p.errors.length ||
        p.variants.some((v) => !v.currency || v.currency !== state.currency)
      ) {
        await putJson(`${op.root}/errors/${safeKey(p.handle)}.json`, {
          handle: p.handle,
          error:
            "Fiche incomplète ou devise incompatible ; produit non importé.",
        })
        batch.failed++
        continue
      }
      const identifier = { customId: uniqueIdentifier(op.origin, p.sourceId) }
      const found = await shopifyGraphql<{
        productByIdentifier: (Mapping & { tags: string[] }) | null
      }>(gql.FIND_PRODUCT, { identifier }, undefined, credentials)
      if (found.productByIdentifier) {
        const r = await shopifyGraphql<{ tagsAdd: { userErrors: Errors } }>(
          gql.TAGS_ADD,
          { id: found.productByIdentifier.id, tags: p.tags },
          undefined,
          credentials,
        )
        check(r.tagsAdd.userErrors)
        const verified = await shopifyGraphql<{
          product: {
            id: string
            tags: string[]
            media: {
              nodes: Array<{ status: string }>
              pageInfo: { hasNextPage: boolean }
            }
            collections: {
              nodes: Array<{ id: string }>
              pageInfo: { hasNextPage: boolean }
            }
          } | null
        }>(
          gql.VERIFY_PRODUCT,
          { id: found.productByIdentifier.id },
          undefined,
          credentials,
        )
        if (
          !verified.product ||
          !p.tags.every((tag) => verified.product!.tags.includes(tag))
        )
          throw new Error(`Tags non confirmés après import : ${p.handle}.`)
        const verificationKey = `${batchKey}-existing-${p.sourceId}.json`
        let verification = await getJson<{ startedAt: number }>(verificationKey)
        if (!verification) {
          verification = { startedAt: Date.now() }
          await putJson(verificationKey, verification)
        }
        const missingCollections = plans
          .filter((plan) => matchesCollection(p.tags, plan))
          .map((plan) => state.collections[plan.key]?.id)
          .filter(
            (id) =>
              id &&
              !verified.product!.collections.nodes.some((c) => c.id === id),
          )
        const processing = verified.product.media.nodes.some((m) =>
          ["UPLOADED", "PROCESSING"].includes(m.status),
        )
        const elapsed = Date.now() - verification.startedAt
        if (
          (missingCollections.length && elapsed < 5 * 60_000) ||
          (processing && elapsed < 60 * 60_000)
        )
          return { complete: false, tasks: [] }
        if (
          missingCollections.length ||
          processing ||
          verified.product.media.pageInfo.hasNextPage ||
          verified.product.media.nodes.some((m) => m.status === "FAILED")
        ) {
          await putJson(
            `${op.root}/errors/${safeKey(p.handle)}-verification.json`,
            {
              handle: p.handle,
              error:
                "Les collections automatiques ou les médias de ce produit existant n’ont pas pu être confirmés. Vérifiez-le dans Shopify.",
              missingCollections,
            },
          )
          batch.failed++
          continue
        }
        await putJson(`${op.root}/mappings/${p.sourceId}.json`, {
          ...found.productByIdentifier,
          created: false,
        })
        await putJson(
          `${op.root}/handles/${safeKey(p.handle)}.json`,
          found.productByIdentifier,
        )
        batch.existing++
      } else
        batch.lines.push({
          handle: p.handle,
          sourceId: p.sourceId,
          identifier,
          input: productInput(
            p,
            op.origin,
            (await remapDescription(p, op.origin, state)).html,
          ),
        })
    }
    await putJson(`${batchKey}.json`, batch)
  }
  const skipped = batch.failed
  if (batch.lines.length) {
    if (!batch.bulkId) {
      const identifier = `imagen:${op._id}:${task.key}`
      const operationName = `CatalogImportProduct_${digest(identifier)}`
      if (batch.submitted) {
        const recent = await shopifyGraphql<{
          bulkOperations: { nodes: Array<{ id: string; query: string }> }
        }>(gql.BULK_RECENT, {}, undefined, credentials)
        const found = recent.bulkOperations.nodes.find((b) =>
          b.query.includes(operationName),
        )
        if (!found)
          throw new Error(
            "Soumission Shopify incertaine : vérifiez les opérations récentes avant toute nouvelle soumission.",
          )
        batch.bulkId = found.id
      } else {
        const staged = await shopifyGraphql<{
          stagedUploadsCreate: {
            stagedTargets: Array<{
              url: string
              parameters: Array<{ name: string; value: string }>
            }>
            userErrors: Errors
          }
        }>(
          gql.STAGED_UPLOAD,
          {
            input: [
              {
                resource: "BULK_MUTATION_VARIABLES",
                filename: "catalogue.jsonl",
                mimeType: "text/jsonl",
                httpMethod: "POST",
              },
            ],
          },
          undefined,
          credentials,
        )
        check(staged.stagedUploadsCreate.userErrors)
        const target = staged.stagedUploadsCreate.stagedTargets[0]
        if (!target || new URL(target.url).protocol !== "https:")
          throw new Error("Cible d’upload Shopify invalide.")
        const form = new FormData()
        target.parameters.forEach((p) => form.append(p.name, p.value))
        form.append(
          "file",
          new Blob(
            [
              batch.lines
                .map((l) =>
                  JSON.stringify({ input: l.input, identifier: l.identifier }),
                )
                .join("\n"),
            ],
            { type: "text/jsonl" },
          ),
          "catalogue.jsonl",
        )
        const upload = await fetch(target.url, {
          method: "POST",
          body: form,
          signal: AbortSignal.timeout(60_000),
        })
        if (!upload.ok) throw new Error(`Upload Shopify HTTP ${upload.status}`)
        batch.submitted = true
        batch.submittedAt = Date.now()
        await putJson(`${batchKey}.json`, batch)
        const r = await shopifyGraphql<{
          bulkOperationRunMutation: {
            bulkOperation: { id: string } | null
            userErrors: Errors
          }
        }>(
          gql.BULK_RUN,
          {
            mutation: gql.PRODUCT_SET.replace(
              "CatalogImportProduct(",
              `${operationName}(`,
            ),
            path: target.parameters.find((p) => p.name === "key")!.value,
            identifier,
          },
          undefined,
          credentials,
        )
        if (r.bulkOperationRunMutation.userErrors.length) {
          batch.submitted = false
          await putJson(`${batchKey}.json`, batch)
          check(r.bulkOperationRunMutation.userErrors)
        }
        if (!r.bulkOperationRunMutation.bulkOperation)
          throw new Error("Soumission Shopify non confirmée.")
        batch.bulkId = r.bulkOperationRunMutation.bulkOperation.id
      }
      await putJson(`${batchKey}.json`, batch)
      return { complete: false, tasks: [] }
    }
    const status = await shopifyGraphql<{
      node: {
        status: string
        url: string | null
        partialDataUrl: string | null
        errorCode: string | null
      }
    }>(gql.BULK_STATUS, { id: batch.bulkId }, undefined, credentials)
    if (["CREATED", "RUNNING", "CANCELING"].includes(status.node.status)) {
      if (Date.now() - (batch.submittedAt ?? op.createdAt) > 24 * 60 * 60_000)
        throw new Error(
          "Opération Shopify toujours en cours après 24 h. Vérifiez son état avant reprise.",
        )
      return { complete: false, tasks: [] }
    }
    const resultUrl = status.node.url ?? status.node.partialDataUrl
    if (!resultUrl)
      throw new Error(
        `Import Shopify ${status.node.status} : ${status.node.errorCode ?? "résultat incomplet"}`,
      )
    const response = await fetch(resultUrl, {
      signal: AbortSignal.timeout(60_000),
    })
    if (!response.ok)
      throw new Error("Résultat Shopify temporairement indisponible.")
    const body = await response.text()
    if (body.length > 8_000_000)
      throw new Error("Résultat de lot trop volumineux.")
    await putJson(`${batchKey}-result.json`, { body })
    const seenLines = new Set<number>()
    for (const line of body.trim().split("\n").filter(Boolean)) {
      const result = JSON.parse(line) as {
        __lineNumber: number
        data?: { productSet?: { product: Mapping | null; userErrors: Errors } }
        errors?: Errors
      }
      if (seenLines.has(result.__lineNumber)) continue
      seenLines.add(result.__lineNumber)
      const source = batch.lines[result.__lineNumber]
      if (!source) throw new Error("Ligne Shopify sans correspondance source.")
      const payload = result.data?.productSet
      if (
        !payload?.product ||
        payload.userErrors.length ||
        result.errors?.length
      ) {
        batch.failed++
        await putJson(`${op.root}/errors/${safeKey(source.handle)}.json`, {
          source,
          errors: payload?.userErrors ??
            result.errors ?? ["Création non confirmée"],
        })
        continue
      }
      const verified = await shopifyGraphql<{
        product: {
          id: string
          status: string
          tags: string[]
          variantsCount: { count: number }
          metafield: { value: string } | null
          media: {
            nodes: ProductMedia[]
            pageInfo: { hasNextPage: boolean }
          }
          collections: {
            nodes: Array<{ id: string }>
            pageInfo: { hasNextPage: boolean }
          }
        }
      }>(gql.VERIFY_PRODUCT, { id: payload.product.id }, undefined, credentials)
      if (!verified.product) throw new Error("Produit absent après import.")
      const expected = source.input as ReturnType<typeof productInput>
      if (
        verified.product.metafield?.value !==
          externalId(op.origin, source.sourceId) ||
        verified.product.variantsCount.count !== expected.variants.length ||
        !expected.tags.every((t) => verified.product.tags.includes(t))
      )
        throw new Error(`Vérification incohérente : ${source.handle}.`)
      const expectedCollections = plans
        .filter((p) => matchesCollection(expected.tags, p))
        .map((p) => state.collections[p.key]?.id)
        .filter(Boolean)
      const missingCollections = expectedCollections.filter(
        (id) => !verified.product.collections.nodes.some((c) => c.id === id),
      )
      if (
        missingCollections.length &&
        !verified.product.collections.pageInfo.hasNextPage &&
        Date.now() - (batch.submittedAt ?? op.createdAt) < 5 * 60_000
      )
        return { complete: false, tasks: [] }
      if (
        missingCollections.length ||
        verified.product.media.pageInfo.hasNextPage ||
        verified.product.media.nodes.length < expected.files.length
      ) {
        batch.failed++
        await putJson(
          `${op.root}/errors/${safeKey(source.handle)}-verification.json`,
          {
            handle: source.handle,
            error:
              "Appartenances automatiques ou médias incomplets lors de la relecture Shopify.",
            missingCollections,
          },
        )
        continue
      }
      const media = verified.product.media.nodes
      if (media.some((m) => ["UPLOADED", "PROCESSING"].includes(m.status))) {
        if (Date.now() - (batch.submittedAt ?? op.createdAt) > 60 * 60_000)
          throw new Error(
            "Médias Shopify toujours en traitement après une heure.",
          )
        return { complete: false, tasks: [] }
      }
      const failedMedia = media.filter((m) => m.status === "FAILED")
      const retryFiles = mediaRetryInputs(failedMedia, expected.files)
      if (
        retryFiles.length &&
        !(await getJson(`${batchKey}-media-retry-${source.sourceId}.json`))
      ) {
        await putJson(`${batchKey}-media-retry-${source.sourceId}.json`, {
          requestedAt: Date.now(),
        })
        const retry = await shopifyGraphql<{
          fileUpdate: { userErrors: Errors }
        }>(
          gql.MEDIA_RETRY,
          {
            files: retryFiles,
          },
          undefined,
          credentials,
        )
        check(retry.fileUpdate.userErrors)
        return { complete: false, tasks: [] }
      }
      if (failedMedia.length) {
        batch.failed++
        await putJson(
          `${op.root}/errors/${safeKey(source.handle)}-media.json`,
          {
            id: payload.product.id,
            error:
              "Transfert d’image échoué. Une source ambiguë exige une correction dans Shopify.",
            media,
          },
        )
      }
      await putJson(`${op.root}/mappings/${source.sourceId}.json`, {
        ...payload.product,
        created: true,
      })
      await putJson(
        `${op.root}/handles/${safeKey(source.handle)}.json`,
        payload.product,
      )
    }
    for (let i = 0; i < batch.lines.length; i++)
      if (!seenLines.has(i)) {
        batch.failed++
        await putJson(
          `${op.root}/errors/${safeKey(batch.lines[i].handle)}.json`,
          {
            handle: batch.lines[i].handle,
            error:
              "Aucun résultat Shopify pour cette ligne. Relancez un import depuis le catalogue figé pour réconcilier les créations.",
          },
        )
      }
  }
  const next = batch.next
    ? await spec(
        op.root,
        `import-products-${digest(batch.next)}`,
        "importProducts",
        { cursor: batch.next },
      )
    : await spec(op.root, "import-links", "importLinks", {})
  return {
    complete: true,
    tasks: [next],
    done: Math.max(
      0,
      batch.existing + batch.lines.length - (batch.failed - skipped),
    ),
    failed: batch.failed,
  }
}
