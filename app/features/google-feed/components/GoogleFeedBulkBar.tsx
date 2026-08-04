import { Link } from "@tanstack/react-router"
import { Play, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"

import { ageGroupOptions, genderOptions } from "../constants"
import { GoogleCategoryCombobox } from "./GoogleCategoryCombobox"
import { GoogleValueSelect } from "./GoogleValueSelect"

export function GoogleFeedBulkBar({
  productCount,
  variantCount,
  variantSelectionCount,
  categoryEnabled,
  genderEnabled,
  ageGroupEnabled,
  busy,
  onCategory,
  onGender,
  onAgeGroup,
  onApplyRules,
  onClear,
}: {
  productCount: number
  variantCount: number
  variantSelectionCount: number
  categoryEnabled: boolean
  genderEnabled: boolean
  ageGroupEnabled: boolean
  busy: boolean
  onCategory: (value: string) => void
  onGender: (value: string) => void
  onAgeGroup: (value: string) => void
  onApplyRules: () => void
  onClear: () => void
}) {
  if (productCount === 0 && variantCount === 0) return null
  return (
    <div className="sticky bottom-3 z-20 mt-4 flex flex-col gap-3 rounded-lg border bg-background p-3 shadow-sm lg:flex-row lg:items-center">
      <p className="shrink-0 text-sm font-medium">
        {productCount} produit{productCount === 1 ? "" : "s"} · {variantCount} variante{variantCount === 1 ? "" : "s"} concernée{variantCount === 1 ? "" : "s"}
      </p>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 lg:justify-end">
        {productCount > 0 && categoryEnabled ? (
          <div className="min-w-56 flex-1 lg:max-w-xs">
            <GoogleCategoryCombobox value={null} compact onChange={onCategory} />
          </div>
        ) : null}
        {productCount > 0 && genderEnabled ? (
          <GoogleValueSelect value={null} options={genderOptions} label="Définir le genre de la sélection" onChange={onGender} />
        ) : null}
        {variantSelectionCount > 0 && ageGroupEnabled ? (
          <GoogleValueSelect value={null} options={ageGroupOptions} label="Définir la tranche d’âge de la sélection" onChange={onAgeGroup} />
        ) : null}
        <Button type="button" variant="outline" disabled={busy} onClick={onApplyRules}>
          <Play data-icon="inline-start" />
          Appliquer les règles
        </Button>
        <Button asChild>
          <Link to="/google-feed/preview" search={{ status: "all", page: 1 }}>Prévisualiser</Link>
        </Button>
        <Button type="button" variant="ghost" size="icon" aria-label="Effacer la sélection" onClick={onClear}>
          <Trash2 />
        </Button>
      </div>
    </div>
  )
}
