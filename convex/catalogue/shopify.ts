"use node"
import { createHash } from "node:crypto"
import { load } from "cheerio"
import type { ActionCtx } from "../_generated/server"
import { internal } from "../_generated/api"
import type { Doc, Id } from "../_generated/dataModel"
import { shopifyGraphql } from "../shopify/client"
import { shopifyCredentialsForShop } from "../shopScope"
import { REQUIRED_SHOPIFY_ADMIN_SCOPES } from "../shopify/scopes"
import {
  decode,
  encode,
  effective,
  identity,
  type Structure,
  type Work,
  type CatalogProduct,
  type RemoteResult,
} from "./model"
import { cleanHtml, importDescription } from "./extract"
import { productInput, uniqueIdentifier } from "./shopifyModel"
import * as gql from "./graphql"

type Fence = { id: Id<"catalogues">; generation: number; token: string }
type Mapping = { id: string; handle: string; tags?: string[] }
type Errors = Array<{ message: string }>
type Page = {
  page: Doc<"produits">[]
  isDone: boolean
  continueCursor: string
}
const digest = (s: string) => createHash("sha256").update(s).digest("hex")
const check = (errors?: Errors) => {
  if (errors?.length) throw new Error(errors.map((e) => e.message).join(" · "))
}
export function targetMenu(
  s: Structure,
  mappings: NonNullable<Work["mappings"]>,
  origin: string,
) {
  function walk(nodes: Structure["menu"], depth: number): unknown[] {
    if (nodes.length && depth > 3)
      throw new Error("Le menu dépasse les trois niveaux acceptés par Shopify.")
    return nodes.map((n) => {
      const key = n.url
        ? decodeURIComponent(new URL(n.url, origin).pathname.split("/")[2])
        : null
      const target = key ? mappings[key] : null
      if (key && !target)
        throw new Error(`Collection destination absente : ${n.title}`)
      return {
        title: n.title,
        ...(target
          ? { type: "COLLECTION", resourceId: target.id }
          : { type: "HTTP", url: "#" }),
        items: walk(n.children, depth + 1),
      }
    })
  }
  return walk(s.menu, 1)
}
export async function importStep(
  ctx: ActionCtx,
  f: Fence,
  c: Doc<"catalogues">,
  w: Work,
) {
  const shop: Doc<"shops"> = await ctx.runQuery(internal.catalogues.shop, {
    id: w.shopId as Id<"shops">,
    owner: c.ownerId,
  })
  const credentials = shopifyCredentialsForShop(shop),
    s = decode<Structure>(c.structure)
  const request = <T>(q: string, variables: Record<string, unknown> = {}) =>
    shopifyGraphql<T>(q, variables, undefined, credentials, {
      timeoutMs: 30_000,
    })
  const hold = () =>
    ctx.runMutation(internal.catalogues.hold, { ...f, work: encode(w) })
  const next = (delay = 0) =>
    ctx.runMutation(internal.catalogues.checkpoint, {
      ...f,
      work: encode(w),
      structure: encode(s),
      delay,
    })
  const remote = (p: Doc<"produits">, result: RemoteResult) =>
    ctx.runMutation(internal.catalogues.result, {
      ...f,
      productId: p._id,
      state: p.state,
      attempts: p.attempts,
      remote: encode({ ...result, catalogueVersion: w.importVersion }),
    })
  if (w.phase === "setup") {
    const diagnostic = await request<{
      currentAppInstallation: { accessScopes: Array<{ handle: string }> }
      shop: { currencyCode: string; primaryDomain: { url: string } }
    }>(gql.DIAGNOSTIC)
    const missing = REQUIRED_SHOPIFY_ADMIN_SCOPES.filter(
      (scope) =>
        !diagnostic.currentAppInstallation.accessScopes.some(
          (x) => x.handle === scope,
        ),
    )
    if (missing.length)
      throw new Error(`Autorisations manquantes : ${missing.join(", ")}`)
    const defs = await request<{
      metafieldDefinitions: {
        nodes: Array<{
          type: { name: string }
          capabilities: { uniqueValues: { enabled: boolean } }
        }>
      }
    }>(gql.DEFINITIONS, { ownerType: "PRODUCT" })
    if (defs.metafieldDefinitions.nodes.length) {
      const d = defs.metafieldDefinitions.nodes[0]
      if (d.type.name !== "id" || !d.capabilities.uniqueValues.enabled)
        throw new Error(
          "La définition d’identité Shopify existante est incompatible.",
        )
    } else {
      const r = await request<{
        metafieldDefinitionCreate: { userErrors: Errors }
      }>(gql.DEFINITION, {
        definition: {
          name: "Source catalogue",
          namespace: "imagen_catalog",
          key: "source_id",
          type: "id",
          ownerType: "PRODUCT",
          capabilities: { uniqueValues: { enabled: true } },
        },
      })
      check(r.metafieldDefinitionCreate.userErrors)
    }
    w.domain = diagnostic.shop.primaryDomain.url
    w.currency = diagnostic.shop.currencyCode
    w.phase = "collections"
    w.collection = 0
    return next()
  }
  if (w.phase === "collections") {
    const col = s.collections[w.collection ?? 0]
    if (!col) {
      w.phase = "products"
      w.collection = 0
      return next()
    }
    const handle = `${col.key.slice(0, 120)}-${digest(encode([c.origin, col.key, [col.tag], "all"])).slice(0, 8)}`
    const marker = `${identity(c.origin, col.key)}:${digest(encode([[col.tag], "all"]))}`
    const found = await request<{
      collections: {
        nodes: Array<Mapping & { metafield: { value: string } | null }>
      }
    }>(gql.COLLECTIONS, { query: `handle:${handle}` })
    let target: Mapping | undefined = found.collections.nodes.find(
      (x) => x.handle === handle,
    )
    if (
      target &&
      found.collections.nodes.find((x) => x.id === target!.id)?.metafield
        ?.value !== marker
    )
      throw new Error(`La collection ${handle} appartient à un autre import.`)
    if (!target) {
      const created = await request<{
        collectionCreate: { collection: Mapping | null; userErrors: Errors }
      }>(gql.COLLECTION_CREATE, {
        input: {
          title: col.title,
          handle,
          descriptionHtml: cleanHtml(col.description),
          ...(col.image ? { image: { src: col.image } } : {}),
          ruleSet: {
            appliedDisjunctively: false,
            rules: [{ column: "TAG", relation: "EQUALS", condition: col.tag }],
          },
          metafields: [
            {
              namespace: "imagen_catalog",
              key: "source_id",
              type: "single_line_text_field",
              value: marker,
            },
          ],
        },
      })
      check(created.collectionCreate.userErrors)
      target = created.collectionCreate.collection ?? undefined
    }
    if (!target) throw new Error("Création de collection non confirmée.")
    w.mappings ??= {}
    w.mappings[col.key] = target
    w.collection = (w.collection ?? 0) + 1
    return next()
  }
  if (w.phase === "products") {
    if (w.bulk) {
      if (!w.bulk.id) {
        const recent = await request<{
          bulkOperations: { nodes: Array<{ id: string; query: string }> }
        }>(gql.BULK_RECENT)
        const matches = recent.bulkOperations.nodes.filter((x) =>
          x.query.includes(w.bulk!.token),
        )
        if (matches.length !== 1)
          throw new Error(
            "Soumission Shopify incertaine. Réconciliation requise ; aucun produit ne sera resoumis.",
          )
        w.bulk.id = matches[0].id
        await hold()
      }
      const status = await request<{
        node: {
          status: string
          url?: string
          partialDataUrl?: string
          errorCode?: string
        } | null
      }>(gql.BULK_STATUS, { id: w.bulk.id })
      if (!status.node)
        throw new Error(
          "Soumission Shopify introuvable. Ne pas recréer les produits.",
        )
      if (["CREATED", "RUNNING", "CANCELING"].includes(status.node.status))
        return next(5000)
      // Lookup by stable identity is the authoritative reconciliation, including partial bulk results.
      for (const id of w.bulk.ids.slice(
        w.bulk.resultOffset ?? 0,
        (w.bulk.resultOffset ?? 0) + 5,
      )) {
        const p: Doc<"produits"> | null = await ctx.runQuery(
          internal.catalogues.byId,
          { id: id as Id<"produits"> },
        )
        if (!p?.data) throw new Error("Fiche de soumission introuvable.")
        const data = decode<CatalogProduct>(p.data!)
        const found = await request<{ productByIdentifier: Mapping | null }>(
          gql.FIND_PRODUCT,
          {
            identifier: {
              customId: uniqueIdentifier(c.origin, data.sourceId!),
            },
          },
        )
        await remote(
          p,
          found.productByIdentifier
            ? {
                shopId: w.shopId!,
                status: "verifying",
                ...found.productByIdentifier,
                created: true,
                startedAt: w.bulk.submittedAt,
              }
            : {
                shopId: w.shopId!,
                status: "failed",
                error: `Produit absent après la soumission terminée (${status.node.status}${status.node.errorCode ? ` : ${status.node.errorCode}` : ""}).`,
              },
        )
      }
      w.bulk.resultOffset = (w.bulk.resultOffset ?? 0) + 5
      if (w.bulk.resultOffset >= w.bulk.ids.length) w.bulk = undefined
      return next()
    }
    const groups = [...s.collections.map((x) => x.key), "~none"],
      group = groups[w.collection ?? 0]
    if (!group) {
      w.phase = "results"
      w.cursor = undefined
      return next()
    }
    const page: Page = await ctx.runQuery(internal.catalogues.page, {
      id: c._id,
      cursor: w.cursor,
      selected: true,
      group,
      limit: 5,
    })
    const lines: Array<{
        input: ReturnType<typeof productInput>
        identifier: { customId: ReturnType<typeof uniqueIdentifier> }
      }> = [],
      ids: string[] = []
    for (const p of page.page.slice(0, 20)) {
      if (p.state !== "complete" || !p.data) continue
      const data = effective(
        { ...decode<CatalogProduct>(p.data), collections: p.collections },
        s,
        decode(p.override ?? "{}"),
      )
      if (data.excluded) continue
      const old = p.remote ? decode<RemoteResult>(p.remote) : null
      if (
        old &&
        old.shopId === w.shopId &&
        old.catalogueVersion === w.importVersion &&
        ["complete", "verifying"].includes(old.status)
      )
        continue
      try {
        if (data.variants.some((v) => !v.currency))
          throw new Error(
            "Devise source non vérifiée. Aucune conversion implicite.",
          )
        if (data.variants.some((v) => v.currency && v.currency !== w.currency))
          throw new Error(
            `Devise source différente de ${w.currency}. Aucune conversion implicite.`,
          )
        const found = await request<{ productByIdentifier: Mapping | null }>(
          gql.FIND_PRODUCT,
          {
            identifier: {
              customId: uniqueIdentifier(c.origin, data.sourceId!),
            },
          },
        )
        if (found.productByIdentifier) {
          const target = found.productByIdentifier,
            missing = data.tags.filter((t) => !target.tags?.includes(t))
          if (missing.length) {
            const r = await request<{ tagsAdd: { userErrors: Errors } }>(
              gql.TAGS_ADD,
              { id: target.id, tags: missing },
            )
            check(r.tagsAdd.userErrors)
          }
          await remote(p, {
            shopId: w.shopId!,
            status: "verifying",
            ...target,
            created: false,
            startedAt: Date.now(),
          })
        } else {
          const input = productInput(data, c.origin, importDescription(data))
          const line = {
            input,
            identifier: {
              customId: uniqueIdentifier(c.origin, data.sourceId!),
            },
          }
          if (Buffer.byteLength(encode(line)) > 4_000_000)
            throw new Error(
              "Produit trop volumineux pour une soumission Shopify.",
            )
          lines.push(line)
          ids.push(p._id)
        }
      } catch (e) {
        await remote(p, {
          shopId: w.shopId!,
          status: "failed",
          error: e instanceof Error ? e.message : "Préparation impossible.",
        })
      }
    }
    // The list is bounded by the same byte budget as the Convex page (<2 MB).
    if (lines.length) {
      const jsonl = lines.map(encode).join("\n"),
        token = `Catalogue_${digest(encode([c._id, f.generation, ids])).slice(0, 24)}`
      if (Buffer.byteLength(jsonl) > 8_000_000)
        throw new Error("Soumission Shopify trop volumineuse.")
      const staged = await request<{
        stagedUploadsCreate: {
          stagedTargets: Array<{
            url: string
            parameters: Array<{ name: string; value: string }>
          }>
          userErrors: Errors
        }
      }>(gql.STAGED_UPLOAD, {
        input: [
          {
            resource: "BULK_MUTATION_VARIABLES",
            filename: "catalogue.jsonl",
            mimeType: "text/jsonl",
            httpMethod: "POST",
          },
        ],
      })
      check(staged.stagedUploadsCreate.userErrors)
      const target = staged.stagedUploadsCreate.stagedTargets[0]
      if (!target || new URL(target.url).protocol !== "https:")
        throw new Error("Cible d’upload Shopify invalide.")
      const form = new FormData()
      target.parameters.forEach((p) => form.append(p.name, p.value))
      form.append(
        "file",
        new Blob([jsonl], { type: "text/jsonl" }),
        "catalogue.jsonl",
      )
      const uploaded = await fetch(target.url, {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(30_000),
      })
      if (!uploaded.ok)
        throw new Error(`Upload Shopify HTTP ${uploaded.status}`)
      w.bulk = { token, ids, submittedAt: Date.now() }
      await hold()
      const submitted = await request<{
        bulkOperationRunMutation: {
          bulkOperation: { id: string } | null
          userErrors: Errors
        }
      }>(gql.BULK_RUN, {
        mutation: gql.PRODUCT_SET.replace("CatalogImportProduct(", `${token}(`),
        path: target.parameters.find((x) => x.name === "key")!.value,
        identifier: token,
      })
      if (submitted.bulkOperationRunMutation.userErrors.length) {
        w.bulk = undefined
        await hold()
        check(submitted.bulkOperationRunMutation.userErrors)
      }
      if (!submitted.bulkOperationRunMutation.bulkOperation)
        throw new Error("Soumission Shopify incertaine.")
      w.bulk!.id = submitted.bulkOperationRunMutation.bulkOperation.id
    }
    w.cursor = page.isDone ? undefined : page.continueCursor
    if (page.isDone) w.collection = (w.collection ?? 0) + 1
    return next(1000)
  }
  if (w.phase === "results" || w.phase === "links") {
    const page: Page = await ctx.runQuery(internal.catalogues.page, {
      id: c._id,
      selected: true,
      cursor: w.cursor,
      limit: 5,
    })
    for (const p of page.page) {
      const r = p.remote ? decode<RemoteResult>(p.remote) : null
      if (!r || r.shopId !== w.shopId || !r.id || r.status === "failed")
        continue
      const data = effective(
        { ...decode<CatalogProduct>(p.data!), collections: p.collections },
        s,
        decode(p.override ?? "{}"),
      )
      if (w.phase === "results" && r.status !== "complete") {
        const verified = await request<{
          product: {
            status: string
            tags: string[]
            variantsCount: { count: number }
            metafield: { value: string } | null
            media: {
              nodes: Array<{ status: string }>
              pageInfo: { hasNextPage: boolean }
            }
            collections: {
              nodes: Array<{ id: string }>
              pageInfo: { hasNextPage: boolean }
            }
          } | null
        }>(gql.VERIFY_PRODUCT, { id: r.id })
        const value = verified.product
        if (
          !value ||
          value.metafield?.value !== identity(c.origin, data.sourceId!)
        ) {
          await remote(p, {
            ...r,
            status: "failed",
            error: "Identité Shopify non vérifiée.",
          })
          continue
        }
        const expected = s.collections
          .filter((x) => data.tags.includes(x.tag))
          .map((x) => w.mappings?.[x.key]?.id)
        const waiting =
          value.media.nodes.some((m) =>
            ["UPLOADED", "PROCESSING"].includes(m.status),
          ) ||
          expected.some(
            (id) => !value.collections.nodes.some((x) => x.id === id),
          )
        if (waiting && Date.now() - (r.startedAt ?? c.createdAt) < 600_000) {
          w.passPending = true
          continue
        }
        const error =
          (r.created &&
            (value.status !== "DRAFT" ||
              value.variantsCount.count !== data.variants.length ||
              value.media.nodes.length < data.images.length)) ||
          value.media.nodes.some((m) => m.status === "FAILED") ||
          value.media.pageInfo.hasNextPage ||
          value.collections.pageInfo.hasNextPage ||
          waiting ||
          data.tags.some((t) => !value.tags.includes(t))
        await remote(p, {
          ...r,
          status: error ? "failed" : "complete",
          ...(error
            ? {
                error:
                  "Produits, images ou appartenances Shopify non conformes ; intervention requise.",
              }
            : {}),
        })
      }
      if (w.phase === "links" && r.created && r.status === "complete") {
        const $ = load(importDescription(data), null, false)
        for (const el of $("a[href]").toArray()) {
          const a = $(el)
          try {
            const url = new URL(a.attr("href")!, c.origin)
            if (
              url.hostname.replace(/^www\./, "") !==
              new URL(c.origin).hostname.replace(/^www\./, "")
            )
              continue
            const collection = url.pathname.match(
                /^\/collections\/([^/]+)\/?$/,
              )?.[1],
              product = productLinkForImport(url.pathname)
            if (collection && w.mappings?.[decodeURIComponent(collection)])
              a.attr(
                "href",
                `${w.domain}/collections/${w.mappings[decodeURIComponent(collection)].handle}`,
              )
            else if (product) {
              const mapped: string | null = await ctx.runQuery(
                internal.catalogues.targetHandle,
                { id: c._id, handle: product, shopId: w.shopId! },
              )
              if (mapped) a.attr("href", `${w.domain}/products/${mapped}`)
              else a.removeAttr("href")
            } else a.removeAttr("href")
          } catch {
            a.removeAttr("href")
          }
        }
        const updated = await request<{
          productUpdate: { userErrors: Errors }
        }>(gql.DESCRIPTION_UPDATE, {
          product: { id: r.id, descriptionHtml: cleanHtml($.html()) },
        })
        check(updated.productUpdate.userErrors)
      }
    }
    w.cursor = page.isDone ? undefined : page.continueCursor
    if (page.isDone) {
      if (w.passPending) w.passPending = false
      else w.phase = w.phase === "results" ? "links" : "summary"
    }
    return next(w.phase === "results" ? 5000 : 0)
  }
  if (w.phase === "summary") {
    w.summary ??= {
      complete: 0,
      failed: 0,
      skipped: 0,
      created: 0,
      existing: 0,
    }
    const page: Page = await ctx.runQuery(internal.catalogues.page, {
      id: c._id,
      selected: true,
      cursor: w.cursor,
    })
    for (const p of page.page) {
      const r = p.remote ? decode<RemoteResult>(p.remote) : null
      if (
        p.state !== "complete" ||
        decode<{ excluded?: boolean }>(p.override ?? "{}").excluded
      )
        w.summary.skipped++
      else if (r && r.shopId === w.shopId && r.status === "complete") {
        w.summary.complete++
        if (r.created) w.summary.created++
        else w.summary.existing++
      } else w.summary.failed++
    }
    w.cursor = page.isDone ? undefined : page.continueCursor
    if (page.isDone) w.phase = "finish"
    return next()
  }
  if (w.phase === "finish") {
    const handle = `imagen-catalogue-${c._id}-v${w.importVersion}`,
      found = await request<{ menus: { nodes: Mapping[] } }>(gql.MENUS, {
        query: `handle:${handle}`,
      })
    let menu = found.menus.nodes.find((x) => x.handle === handle)
    if (!menu) {
      const created = await request<{
        menuCreate: { menu: Mapping | null; userErrors: Errors }
      }>(gql.MENU_CREATE, {
        title: `Catalogue ${new URL(c.origin).hostname}`,
        handle,
        items: targetMenu(s, w.mappings ?? {}, c.origin),
      })
      check(created.menuCreate.userErrors)
      menu = created.menuCreate.menu ?? undefined
    }
    if (!menu) throw new Error("Création du menu non confirmée.")
    await ctx.runMutation(internal.catalogues.checkpoint, {
      ...f,
      structure: encode(s),
      ...(w.summary?.failed ? { status: "partial" as const } : {}),
      lastImport: encode({
        ...w.summary,
        shopId: w.shopId,
        domain: w.domain,
        version: w.importVersion,
        menuId: menu.id,
        completedAt: Date.now(),
      }),
    })
  }
}
const productLinkForImport = (path: string) => {
  const match = path.match(/\/products\/([^/]+)\/?$/)
  return match ? decodeURIComponent(match[1]) : null
}
