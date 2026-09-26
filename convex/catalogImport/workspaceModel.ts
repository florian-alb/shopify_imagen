import {
  matchesCollection,
  prepareProduct,
  safeKey,
  type CatalogProduct,
  type Preparation,
  type ProductOverride,
} from "./model"

/** One resolver for lists, details, membership and snapshots. Never translate or infer new tags. */
export function resolveWorkspace(
  source: CatalogProduct,
  prep: Preparation,
  override: ProductOverride,
) {
  const product = prepareProduct(source, prep.collections, override)
  const row = {
    handle: product.handle,
    title: product.title,
    url: product.url,
    errors: product.errors,
    image: product.images[0]?.url ?? null,
    variants: product.variants.length,
    tags: product.tags,
    collections: product.collections,
    jsonStatus: product.jsonStatus,
    htmlStatus: product.htmlStatus,
    issues: product.errors.length + product.warnings.length,
    excluded: product.excluded,
    reviewed: product.reviewed,
  }
  const scopes = [
    "",
    ...prep.collections
      .filter((c) => matchesCollection(product.tags, c))
      .map((c) => c.key),
  ]
  const errors = product.errors.length > 0
  const issues = !product.reviewed && row.issues > 0
  return { product, row, scopes, errors, issues }
}
export type WorkspaceRow = ReturnType<typeof resolveWorkspace>["row"]

// UTF-16 code units encoded as fixed-width ASCII preserve JS includes(), including
// punctuation, accents, whitespace and surrogate pairs. Ordinary full-text search
// tokenizes words and is not equivalent. These are B-tree prefix ranges, not FTS.
export function searchCode(value: string) {
  let result = ""
  for (let i = 0; i < value.length; i++)
    result += value.charCodeAt(i).toString(16).padStart(4, "0")
  return result
}
export function searchEntries(title: string, handle: string) {
  const lower = title.toLowerCase()
  const entries = [{ sort: `!${safeKey(handle)}`, position: -1, minLength: 0 }]
  type Trie = { children: Map<string, Trie> }
  const root: Trie = { children: new Map() }
  for (let i = 0; i < lower.length; i++) {
    let node = root
    let minLength = 0
    for (let j = i; j < lower.length; j++) {
      let child = node.children.get(lower[j])
      if (!child) {
        child = { children: new Map() }
        node.children.set(lower[j], child)
        if (!minLength) minLength = j - i + 1
      }
      node = child
    }
    // Entire suffix already occurs earlier: it can never be a first match.
    if (minLength)
      entries.push({
        sort: `${searchCode(lower.slice(i))}!${safeKey(handle)}`,
        position: i,
        minLength,
      })
  }
  return entries
}
export function viewScope(
  collection: string,
  onlyErrors: boolean,
  onlyIssues: boolean,
) {
  return JSON.stringify([collection, onlyErrors, onlyIssues])
}
export function indexEntries(resolved: ReturnType<typeof resolveWorkspace>) {
  const terms = searchEntries(resolved.row.title, resolved.row.handle)
  const filters = [
    [false, false],
    ...(resolved.errors ? [[true, false]] : []),
    ...(resolved.issues ? [[false, true]] : []),
    ...(resolved.errors && resolved.issues ? [[true, true]] : []),
  ]
  const entries = resolved.scopes.flatMap((scope) =>
    filters.flatMap(([errors, issues]) =>
      terms.map((term) => ({
        scope: viewScope(scope, errors, issues),
        ...term,
      })),
    ),
  )
  // A product edit replaces its postings atomically. Fail explicitly rather than
  // partially publishing a product that cannot fit in a transaction.
  if (entries.length > 3500)
    throw new Error(
      "Index produit trop volumineux pour une édition atomique (3 500 entrées). Migration non publiée ; réduisez les règles redondantes ou partitionnez cet index.",
    )
  return entries
}
