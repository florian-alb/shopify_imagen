import type { MetafieldDefinitionCandidate } from "./model"
import {
  GOOGLE_FEED_METAFIELDS_SET_MUTATION,
  GOOGLE_FEED_VERIFY_METAFIELDS_QUERY,
} from "./graphql"

export type ShopifyGraphqlTransport = (
  query: string,
  variables: Record<string, unknown>,
) => Promise<unknown>

export type ClaimedGoogleFeedDraft = {
  draftId: string
  runItemId: string
  ownerId: string
  ownerType: "PRODUCT" | "PRODUCTVARIANT"
  attribute: "google_product_category" | "gender" | "age_group"
  namespace: string
  key: string
  type: string
  currentValue: string | null
  currentDigest: string | null
  proposedValue: string
}

export type GoogleFeedPublishResult = {
  draftId: string
  runItemId: string
  status: "confirmed" | "failed"
  value?: string
  digest?: string | null
  error?: string
}

type DefinitionNode = {
  id: string
  namespace: string
  key: string
  name: string
  ownerType: "PRODUCT" | "PRODUCTVARIANT"
  type: { name: string }
  access?: { admin?: string | null } | null
}

export function mapDefinitionCandidates(payload: {
  category: { nodes: DefinitionNode[] }
  gender: { nodes: DefinitionNode[] }
  ageGroup: { nodes: DefinitionNode[] }
}) {
  return [
    ...payload.category.nodes,
    ...payload.gender.nodes,
    ...payload.ageGroup.nodes,
  ].map(
    (node): MetafieldDefinitionCandidate => ({
      id: node.id,
      namespace: node.namespace,
      key: node.key,
      name: node.name,
      type: node.type.name,
      ownerType: node.ownerType,
      adminAccess: node.access?.admin ?? null,
      ownerAppId: null,
    }),
  )
}

function retryableShopifyError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /429|throttl|temporar|timeout|fetch failed/i.test(message)
}

export async function withShopifyRetry<T>(
  operation: () => Promise<T>,
  options: {
    attempts?: number
    sleep?: (delayMs: number) => Promise<void>
  } = {},
) {
  const attempts = Math.max(1, Math.min(options.attempts ?? 3, 3))
  const sleep =
    options.sleep ??
    ((delayMs: number) => new Promise<void>((resolve) => setTimeout(resolve, delayMs)))
  let lastError: unknown
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      if (!retryableShopifyError(error) || attempt === attempts - 1) throw error
      await sleep(250 * 2 ** attempt)
    }
  }
  throw lastError
}

type MetafieldsSetResponse = {
  metafieldsSet: {
    metafields: Array<{
      id: string
      namespace: string
      key: string
      value: string
      compareDigest: string
    }> | null
    userErrors: Array<{
      field: string[]
      message: string
      code?: string | null
      elementIndex?: number | null
    }>
  }
}

type VerifyResponse = {
  nodes: Array<{
    __typename: "Product" | "ProductVariant" | string
    id?: string
    googleFeedValue?: { value: string; compareDigest: string } | null
  } | null>
}

export async function publishGoogleFeedBatch(
  drafts: ClaimedGoogleFeedDraft[],
  transport: ShopifyGraphqlTransport,
) : Promise<GoogleFeedPublishResult[]> {
  if (drafts.length === 0) return []
  if (drafts.length > 25) throw new Error("Shopify accepts at most 25 metafields per batch.")

  let mutation: MetafieldsSetResponse
  try {
    mutation = (await withShopifyRetry(() =>
      transport(GOOGLE_FEED_METAFIELDS_SET_MUTATION, {
        metafields: drafts.map((draft) => ({
          ownerId: draft.ownerId,
          namespace: draft.namespace,
          key: draft.key,
          type: draft.type,
          value: draft.proposedValue,
          compareDigest: draft.currentDigest,
        })),
      }),
    )) as MetafieldsSetResponse
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return drafts.map((draft) => ({
      draftId: draft.draftId,
      runItemId: draft.runItemId,
      status: "failed",
      error: message,
    }))
  }

  if (mutation.metafieldsSet.userErrors.length > 0) {
    const byIndex = new Map<number, string>()
    let generalError = "Shopify a rejeté le lot de metafields."
    for (const error of mutation.metafieldsSet.userErrors) {
      if (error.elementIndex != null) byIndex.set(error.elementIndex, error.message)
      else generalError = error.message
    }
    return drafts.map((draft, index) => ({
      draftId: draft.draftId,
      runItemId: draft.runItemId,
      status: "failed",
      error: byIndex.get(index) ?? generalError,
    }))
  }

  const verified = new Map<string, { value: string; digest: string }>()
  const coordinateGroups = new Map<string, ClaimedGoogleFeedDraft[]>()
  for (const draft of drafts) {
    const key = `${draft.namespace}:${draft.key}`
    coordinateGroups.set(key, [...(coordinateGroups.get(key) ?? []), draft])
  }
  try {
    for (const group of coordinateGroups.values()) {
      const first = group[0]!
      const response = (await withShopifyRetry(() =>
        transport(GOOGLE_FEED_VERIFY_METAFIELDS_QUERY, {
          ownerIds: group.map((draft) => draft.ownerId),
          namespace: first.namespace,
          key: first.key,
        }),
      )) as VerifyResponse
      for (const node of response.nodes) {
        if (node?.id && node.googleFeedValue) {
          verified.set(`${node.id}:${first.namespace}:${first.key}`, {
            value: node.googleFeedValue.value,
            digest: node.googleFeedValue.compareDigest,
          })
        }
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return drafts.map((draft) => ({
      draftId: draft.draftId,
      runItemId: draft.runItemId,
      status: "failed",
      error: `Écriture envoyée, mais relecture impossible : ${message}`,
    }))
  }

  return drafts.map((draft) => {
    const remote = verified.get(`${draft.ownerId}:${draft.namespace}:${draft.key}`)
    if (!remote || remote.value !== draft.proposedValue) {
      return {
        draftId: draft.draftId,
        runItemId: draft.runItemId,
        status: "failed" as const,
        error: "La valeur relue dans Shopify ne correspond pas à la proposition.",
      }
    }
    return {
      draftId: draft.draftId,
      runItemId: draft.runItemId,
      status: "confirmed" as const,
      value: remote.value,
      digest: remote.digest,
    }
  })
}

export function parseGoogleProductTaxonomy(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .flatMap((line) => {
      const separator = line.indexOf(" - ")
      if (separator <= 0) return []
      const id = line.slice(0, separator).trim()
      const label = line.slice(separator + 3).trim()
      return /^\d+$/.test(id) && label ? [{ id, label }] : []
    })
}
