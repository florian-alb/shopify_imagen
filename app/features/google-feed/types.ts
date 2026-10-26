import type { FunctionReturnType } from "convex/server"
import type { api } from "@/lib/convex"

export type ConflictAttribute = FeedDetails["conflicts"][number]
export type ConflictRule = ConflictAttribute["rules"][number]
export type ConflictDraft = ConflictAttribute["drafts"][number]

export type FeedProductPage = FunctionReturnType<typeof api.googleFeedWorkspace.listProducts>
export type FeedProduct = FeedProductPage["products"][number]
export type FeedDetails = FunctionReturnType<typeof api.googleFeedWorkspace.productDetails>
export type FeedRow = FeedDetails["rows"][number]
export type FeedView = "review" | "ready" | "errors"
