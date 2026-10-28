import type { FunctionArgs } from "convex/server"
import type { api } from "@/lib/convex"
import type { GoogleFeedAttribute } from "../constants"
import type { BulkFeedDetails } from "./filtered-selection"

type ChooseArgs = FunctionArgs<typeof api.googleFeedWorkspace.choose>
export type BulkFeedTarget = Pick<ChooseArgs, "productId" | "rows"> & { title: string }

export function bulkFeedTargets(details: BulkFeedDetails[], attribute: GoogleFeedAttribute): BulkFeedTarget[] {
  return details.flatMap(({ product, rows }) => {
    const selected = rows.filter((row) =>
      row.attribute === attribute && row.sourceKind !== "manual" && row.included &&
      (row.status === "conflict" || row.status === "invalid"),
    )
    return selected.length ? [{
      productId: product.id,
      title: product.title,
      rows: selected.map(({ id, updatedAt }) => ({ id, updatedAt })),
    }] : []
  })
}

export async function applyBulkFeedDecision(
  targets: BulkFeedTarget[],
  attribute: GoogleFeedAttribute,
  value: string,
  choose: (args: ChooseArgs) => Promise<{ updated: number; preserved: number }>,
  onProgress: (completed: number) => void,
) {
  const completed: ChooseArgs["productId"][] = []
  const failures: { productId: ChooseArgs["productId"]; title: string; message: string }[] = []
  let updated = 0
  let preserved = 0
  // Keep each product atomic and bound concurrent writes to the existing API.
  for (const target of targets) {
    try {
      const result = await choose({ productId: target.productId, rows: target.rows, attribute, value })
      updated += result.updated
      preserved += result.preserved
      completed.push(target.productId)
    } catch (error) {
      failures.push({
        productId: target.productId,
        title: target.title,
        message: error instanceof Error ? error.message : String(error),
      })
    }
    onProgress(completed.length + failures.length)
  }
  return { completed, failures, updated, preserved }
}
