import { useAction } from "convex/react"
import { api, type Doc } from "@/lib/convex"
import type {
  Preparation,
  PreparedProduct,
} from "../../../../convex/catalogImport/model"
import type { WorkspaceRow } from "../../../../convex/catalogImport/workspaceModel"
import { useCatalogRemote } from "./use-catalog-remote"
import { useCatalogQuery } from "./use-catalog-query"
export function useCatalogProducts(
  op: Doc<"catalogOperations">,
  args: {
    cursor?: string
    collection?: string
    search?: string
    onlyErrors?: boolean
    onlyIssues?: boolean
  },
) {
  const read = useAction(api.catalogImportActions.products)
  const legacy = useCatalogRemote(
    () => read({ id: op._id, ...args }),
    `products:${op.ownerId}:${op._id}:${op.revision}:${op.updatedAt}:${JSON.stringify(args)}`,
    op.storageMode !== "convex" && !!op.preparationKey,
  )
  const remote = useCatalogQuery(
    api.catalogWorkspace.products,
    op.storageMode === "convex" ? { id: op._id, ...args } : "skip",
    `${op.ownerId}:${op._id}:${op.revision}:${op.updatedAt}`,
  )
  return op.storageMode === "convex"
    ? {
        ...remote,
        value: remote.value
          ? {
              ...remote.value,
              rows: JSON.parse(remote.value.json) as WorkspaceRow[],
            }
          : null,
      }
    : legacy
}
export function useCatalogProduct(
  op: Doc<"catalogOperations">,
  handle: string,
) {
  const read = useAction(api.catalogImportActions.product)
  const legacy = useCatalogRemote(
    () => read({ id: op._id, handle }),
    `detail:${op.ownerId}:${op._id}:${op.revision}:${handle}`,
    op.storageMode !== "convex",
  )
  const remote = useCatalogQuery(
    api.catalogWorkspace.product,
    op.storageMode === "convex" ? { id: op._id, handle } : "skip",
    `${op.ownerId}:${op._id}:${op.revision}:${op.updatedAt}`,
  )
  return op.storageMode === "convex"
    ? {
        ...remote,
        value: remote.value
          ? (JSON.parse(remote.value) as PreparedProduct)
          : null,
      }
    : legacy
}
export function useCatalogStructure(op: Doc<"catalogOperations"> | undefined) {
  const read = useAction(api.catalogImportActions.structure)
  const legacy = useCatalogRemote(
    () => read({ id: op!._id }),
    `structure:${op?.ownerId}:${op?._id}:${op?.revision}:${op?.updatedAt}`,
    !!op?.preparationKey && op.storageMode !== "convex",
  )
  const remote = useCatalogQuery(
    api.catalogWorkspace.structure,
    op?.storageMode === "convex" ? { id: op._id } : "skip",
    `${op?.ownerId}:${op?._id}:${op?.revision}:${op?.updatedAt}`,
  )
  return op?.storageMode === "convex"
    ? {
        ...remote,
        value: remote.value ? (JSON.parse(remote.value) as Preparation) : null,
      }
    : legacy
}
