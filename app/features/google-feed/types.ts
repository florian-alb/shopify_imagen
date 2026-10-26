import type { FunctionReturnType } from "convex/server"
import type { api } from "@/lib/convex"

export type ConflictProductPage = FunctionReturnType<typeof api.googleFeedConflicts.listProducts>
export type ConflictProduct = ConflictProductPage["products"][number]
export type ConflictDetails = FunctionReturnType<typeof api.googleFeedConflicts.productDetails>
export type ConflictAttribute = ConflictDetails["attributes"][number]
export type ConflictRule = ConflictAttribute["rules"][number]
export type ConflictDraft = ConflictAttribute["drafts"][number]
