import { ConvexError, v } from "convex/values"

import { internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import { action } from "./_generated/server"
import { requireUserId } from "./authz"
import {
  diagnoseMetafieldDefinitions,
  evaluateGoogleFeedRules,
  normalizeRuleText,
  type GoogleFeedRule,
  type RuleProductContext,
} from "./googleFeed/model"
import {
  GOOGLE_FEED_DEFINITIONS_QUERY,
  GOOGLE_PRODUCT_TAXONOMY_SOURCE,
} from "./googleFeed/graphql"
import {
  mapDefinitionCandidates,
  parseGoogleProductTaxonomy,
  publishGoogleFeedBatch,
  type ShopifyGraphqlTransport,
} from "./googleFeed/shopify"
import { googleFeedDiagnosticAttributeValidator } from "./googleFeed/validators"
import { shopifyGraphql } from "./shopify/client"
import { storeHandleFromDomain, type ShopifyCredentials } from "./shopScope"

type ActionContext = {
  shopId: Id<"shops">
  domain: string
  clientId: string
  clientSecret: string
  accessToken?: string
  productQuery: string
  coordinates: {
    google_product_category: { namespace: string; key: string; type: string } | null
    gender: { namespace: string; key: string; type: string } | null
    age_group: { namespace: string; key: string; type: string } | null
  }
}

function credentialsFromContext(context: ActionContext): ShopifyCredentials {
  return {
    shopId: context.shopId,
    domain: context.domain,
    storeHandle: storeHandleFromDomain(context.domain),
    clientId: context.clientId,
    clientSecret: context.clientSecret,
    ...(context.accessToken ? { accessToken: context.accessToken } : {}),
    productQuery: context.productQuery,
  }
}

function transportFor(context: ActionContext): ShopifyGraphqlTransport {
  const credentials = credentialsFromContext(context)
  return (query: string, variables: Record<string, unknown>) =>
    shopifyGraphql<unknown>(query, variables, undefined, credentials)
}

type DefinitionsResponse = {
  currentAppInstallation: { app: { id: string; title: string } } | null
  category: Parameters<typeof mapDefinitionCandidates>[0]["category"]
  gender: Parameters<typeof mapDefinitionCandidates>[0]["gender"]
  ageGroup: Parameters<typeof mapDefinitionCandidates>[0]["ageGroup"]
}

export const runDiagnostic = action({
  args: {},
  returns: v.object({
    status: v.union(
      v.literal("ready"),
      v.literal("partial"),
      v.literal("blocked"),
    ),
    attributes: v.array(googleFeedDiagnosticAttributeValidator),
    checkedAt: v.number(),
  }),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx)
    const context = (await ctx.runQuery(internal.googleFeed.getActionContext, {
      userId,
    })) as ActionContext
    const response = (await transportFor(context)(
      GOOGLE_FEED_DEFINITIONS_QUERY,
      {},
    )) as DefinitionsResponse
    const diagnostic = diagnoseMetafieldDefinitions(
      mapDefinitionCandidates(response),
      response.currentAppInstallation?.app.id ?? null,
    )
    const checkedAt = Date.now()
    await ctx.runMutation(internal.googleFeed.saveDiagnostic, {
      shopId: context.shopId,
      status: diagnostic.status,
      attributes: diagnostic.attributes,
      checkedAt,
    })
    return { ...diagnostic, checkedAt }
  },
})

type EvaluationPage = {
  page: Array<{
    localProductId: Id<"products">
    shopifyProductId: string
    title: string
    productType: string
    vendor: string
    tags: string[]
    collections: string[]
    googleProductCategory: string | null
    googleProductCategoryDigest: string | null
    manualCategory: boolean
    variants: Array<{
      localVariantId: Id<"productVariants">
      shopifyVariantId: string
      title: string
      sku: string
      selectedOptions: Array<{ name: string; value: string }>
      gender: string | null
      genderDigest: string | null
      ageGroup: string | null
      ageGroupDigest: string | null
      manualGender: boolean
      manualAgeGroup: boolean
    }>
  }>
  isDone: boolean
  continueCursor: string
}

export const evaluateRules = action({
  args: {
    productIds: v.optional(v.array(v.id("products"))),
    variantIds: v.optional(v.array(v.id("productVariants"))),
  },
  returns: v.object({
    runId: v.id("googleFeedRuns"),
    proposed: v.number(),
    status: v.union(
      v.literal("completed"),
      v.literal("partial"),
      v.literal("failed"),
    ),
  }),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const selectedProductIds = new Set(args.productIds ?? [])
    const selectedVariantIds = new Set(args.variantIds ?? [])
    const hasSelection =
      selectedProductIds.size > 0 || selectedVariantIds.size > 0
    const ruleContext = (await ctx.runQuery(
      internal.googleFeed.getRulesForEvaluation,
      { userId },
    )) as {
      shopId: Id<"shops">
      rules: Array<GoogleFeedRule & { id: Id<"googleFeedRules">; updatedAt: number }>
    }
    const activeRules = ruleContext.rules.filter((rule) => rule.active)
    if (activeRules.length === 0) {
      throw new ConvexError("Activez au moins une règle avant l’évaluation.")
    }
    const runId = (await ctx.runMutation(internal.googleFeed.createRun, {
      userId,
      kind: "evaluation",
      source: "rules",
    })) as Id<"googleFeedRuns">
    let cursor: string | null = null
    let proposed = 0
    do {
      const page = (await ctx.runQuery(internal.googleFeed.evaluationPage, {
        userId,
        paginationOpts: { cursor, numItems: 20 },
      })) as EvaluationPage
      const scopedPage = hasSelection
        ? page.page.flatMap((product) => {
            if (selectedProductIds.has(product.localProductId)) return [product]
            const variants = product.variants.filter((variant) =>
              selectedVariantIds.has(variant.localVariantId),
            )
            return variants.length > 0 ? [{ ...product, variants }] : []
          })
        : page.page
      const products: RuleProductContext[] = scopedPage.map((product) => ({
        id: product.shopifyProductId,
        title: product.title,
        productType: product.productType,
        vendor: product.vendor,
        tags: product.tags,
        collections: product.collections,
        currentValues: {
          google_product_category: product.googleProductCategory,
        },
        manualAttributes: product.manualCategory
          ? ["google_product_category"]
          : [],
        variants: product.variants.map((variant) => ({
          id: variant.shopifyVariantId,
          title: variant.title,
          sku: variant.sku,
          selectedOptions: variant.selectedOptions,
          currentValues: {
            gender: variant.gender,
            age_group: variant.ageGroup,
          },
          manualAttributes: [
            ...(variant.manualGender ? (["gender"] as const) : []),
            ...(variant.manualAgeGroup ? (["age_group"] as const) : []),
          ],
        })),
      }))
      const rawProposals = evaluateGoogleFeedRules(activeRules, products)
      const productByShopifyId = new Map(
        scopedPage.map((product) => [product.shopifyProductId, product]),
      )
      const payload = rawProposals.flatMap((proposal) => {
        const product = productByShopifyId.get(proposal.productId)
        if (!product) return []
        const variant = proposal.variantId
          ? product.variants.find(
              (candidate) => candidate.shopifyVariantId === proposal.variantId,
            )
          : null
        const digest =
          proposal.attribute === "google_product_category"
            ? product.googleProductCategoryDigest
            : proposal.attribute === "gender"
              ? variant?.genderDigest ?? null
              : variant?.ageGroupDigest ?? null
        return [
          {
            localProductId: product.localProductId,
            localVariantId: variant?.localVariantId ?? null,
            ownerId: proposal.ownerId,
            ownerType: proposal.ownerType,
            attribute: proposal.attribute,
            currentValue: proposal.currentValue,
            currentDigest: digest,
            proposedValue: proposal.proposedValue,
            selectedRuleId: proposal.selectedRuleId as Id<"googleFeedRules">,
            selectedRuleName: proposal.selectedRuleName,
            matchingRuleIds: proposal.matchingRuleIds as Id<"googleFeedRules">[],
            status: proposal.status,
          },
        ]
      })
      if (payload.length > 0) {
        proposed += (await ctx.runMutation(
          internal.googleFeed.saveEvaluationProposals,
          { userId, runId, proposals: payload },
        )) as number
      }
      cursor = page.isDone ? null : page.continueCursor
      if (page.isDone) break
    } while (cursor)
    const status = (await ctx.runMutation(internal.googleFeed.finishRun, {
      runId,
    })) as "completed" | "partial" | "failed"
    return { runId, proposed, status }
  },
})

export const publish = action({
  args: {
    retryRunId: v.optional(v.id("googleFeedRuns")),
  },
  returns: v.object({
    runId: v.id("googleFeedRuns"),
    published: v.number(),
    failed: v.number(),
    status: v.union(
      v.literal("completed"),
      v.literal("partial"),
      v.literal("failed"),
    ),
  }),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const context = (await ctx.runQuery(internal.googleFeed.getActionContext, {
      userId,
    })) as ActionContext
    const runId = (await ctx.runMutation(internal.googleFeed.createRun, {
      userId,
      kind: "publication",
      source: args.retryRunId ? "retry" : "manual",
    })) as Id<"googleFeedRuns">
    const transport = transportFor(context)
    let published = 0
    let failed = 0
    while (true) {
      const claimed = await ctx.runMutation(internal.googleFeed.claimPublishBatch, {
        userId,
        runId,
        retryRunId: args.retryRunId ?? null,
      })
      if (claimed.length === 0) break
      const results = await publishGoogleFeedBatch(
        claimed.map((draft) => ({
          ...draft,
          draftId: String(draft.draftId),
          runItemId: String(draft.runItemId),
        })),
        transport,
      )
      published += results.filter((result) => result.status === "confirmed").length
      failed += results.filter((result) => result.status === "failed").length
      await ctx.runMutation(internal.googleFeed.completePublishBatch, {
        runId,
        results: results.map((result) => ({
          ...result,
          draftId: result.draftId as Id<"googleFeedDrafts">,
          runItemId: result.runItemId as Id<"googleFeedRunItems">,
        })),
      })
    }
    const status = (await ctx.runMutation(internal.googleFeed.finishRun, {
      runId,
    })) as "completed" | "partial" | "failed"
    return { runId, published, failed, status }
  },
})

export const searchTaxonomy = action({
  args: { query: v.string(), limit: v.optional(v.number()) },
  returns: v.object({
    source: v.string(),
    version: v.string(),
    fetchedAt: v.number(),
    items: v.array(v.object({ id: v.string(), label: v.string() })),
  }),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    await ctx.runQuery(internal.googleFeed.assertActiveShop, { userId })
    const query = normalizeRuleText(args.query)
    const limit = Math.max(1, Math.min(args.limit ?? 30, 50))
    const response = await fetch(GOOGLE_PRODUCT_TAXONOMY_SOURCE)
    if (!response.ok) {
      throw new ConvexError(
        `La taxonomie Google est indisponible (${response.status}).`,
      )
    }
    const text = await response.text()
    const version =
      text
        .split(/\r?\n/)
        .find((line) => /version/i.test(line))
        ?.replace(/^#\s*/, "")
        .trim() ?? "Version non indiquée par la source"
    const items = parseGoogleProductTaxonomy(text)
      .filter(
        (item) =>
          !query ||
          item.id === query ||
          normalizeRuleText(item.label).includes(query),
      )
      .slice(0, limit)
    return {
      source: GOOGLE_PRODUCT_TAXONOMY_SOURCE,
      version,
      fetchedAt: Date.now(),
      items,
    }
  },
})
