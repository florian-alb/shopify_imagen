import type { Doc } from "@/lib/convex"
import type { ImportSelection } from "../../../convex/catalogue/importSelection"
import type { Structure, Work } from "../../../convex/catalogue/model"

export type CatalogueImportResult = {
  domain: string
  menuId?: string
  selection?: ImportSelection
  collections?: number
  complete: number
  failed: number
  skipped: number
  created: number
  existing: number
}

export type Catalogue = Omit<Doc<"catalogues">, "structure" | "work" | "lastImport"> & {
  structure: Structure
  work: Work | null
  lastImport: CatalogueImportResult | null
}
