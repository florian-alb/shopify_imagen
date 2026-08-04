import { ChevronsUpDown, SlidersHorizontal, X } from "lucide-react"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { SegmentedControl } from "@/components/ui/segmented-control"

import { ageGroupOptions, genderOptions } from "../constants"
import type { GoogleFeedCatalogSearch } from "../lib/search"

type Facets = {
  productTypes: string[]
  shopifyStatuses: string[]
  collections: Array<{ id: string; title: string }>
}

const viewOptions = [
  { value: "all", label: "Tous" },
  { value: "incomplete", label: "Incomplets" },
  { value: "conflicts", label: "Conflits" },
  { value: "modified", label: "Modifiés" },
] as const

export function GoogleFeedFilters({
  search,
  facets,
  onChange,
}: {
  search: GoogleFeedCatalogSearch
  facets: Facets | undefined
  onChange: (patch: Partial<GoogleFeedCatalogSearch>) => void
}) {
  const [query, setQuery] = useState(search.q ?? "")
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (query !== (search.q ?? "")) onChange({ q: query || undefined, page: 1 })
    }, 300)
    return () => window.clearTimeout(timer)
  }, [onChange, query, search.q])

  const activeFilterCount = [
    search.productType,
    search.collection,
    search.shopifyStatus,
    search.gender,
    search.ageGroup,
  ].filter(Boolean).length
  const reset = () =>
    onChange({
      productType: undefined,
      collection: undefined,
      shopifyStatus: undefined,
      gender: undefined,
      ageGroup: undefined,
      page: 1,
    })

  return (
    <div className="mb-4 flex flex-col gap-3 border-b pb-4 xl:flex-row xl:items-center">
      <SegmentedControl
        className="w-full xl:w-auto"
        value={search.view}
        onValueChange={(view) =>
          onChange({ view: view as GoogleFeedCatalogSearch["view"], page: 1 })
        }
        options={viewOptions}
        ariaLabel="Filtrer le catalogue Google"
      />
      <div className="flex min-w-0 flex-1 gap-2 xl:justify-end">
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Titre, handle ou SKU…"
          aria-label="Rechercher dans le flux Google"
          className="min-w-0 xl:max-w-sm"
        />
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" className="shrink-0">
              <SlidersHorizontal data-icon="inline-start" />
              Filtres{activeFilterCount ? ` (${activeFilterCount})` : ""}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="w-[min(26rem,calc(100vw-2rem))] space-y-4 border border-border"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium">Filtres catalogue</p>
              {activeFilterCount ? (
                <Button type="button" variant="ghost" size="sm" onClick={reset}>
                  <X data-icon="inline-start" />
                  Effacer
                </Button>
              ) : null}
            </div>
            <FilterCombobox
              label="Collection"
              value={search.collection}
              options={facets?.collections.map((item) => ({ value: item.id, label: item.title })) ?? []}
              onChange={(collection) => onChange({ collection, page: 1 })}
            />
            <FilterCombobox
              label="Type de produit"
              value={search.productType}
              options={facets?.productTypes.map((value) => ({ value, label: value })) ?? []}
              onChange={(productType) => onChange({ productType, page: 1 })}
            />
            <FilterCombobox
              label="Statut Shopify"
              value={search.shopifyStatus}
              options={facets?.shopifyStatuses.map((value) => ({ value, label: value })) ?? []}
              onChange={(shopifyStatus) => onChange({ shopifyStatus, page: 1 })}
            />
            <FilterCombobox
              label="Genre"
              value={search.gender}
              options={genderOptions}
              onChange={(gender) => onChange({ gender, page: 1 })}
            />
            <FilterCombobox
              label="Tranche d’âge"
              value={search.ageGroup}
              options={ageGroupOptions}
              onChange={(ageGroup) => onChange({ ageGroup, page: 1 })}
            />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}

function FilterCombobox({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value?: string
  options: ReadonlyArray<{ value: string; label: string }>
  onChange: (value: string | undefined) => void
}) {
  const [open, setOpen] = useState(false)
  const selectedLabel = options.find((option) => option.value === value)?.label ?? "Tous"

  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label={label}
            className="w-full justify-between"
          >
            <span className="truncate">{selectedLabel}</span>
            <ChevronsUpDown data-icon="inline-end" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-(--radix-popover-trigger-width) border border-border p-0"
        >
          <Command>
            <CommandInput placeholder={`Rechercher ${label.toLocaleLowerCase("fr-FR")}…`} />
            <CommandList>
              <CommandEmpty>Aucun résultat.</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value="Tous"
                  data-checked={!value}
                  onSelect={() => {
                    onChange(undefined)
                    setOpen(false)
                  }}
                >
                  Tous
                </CommandItem>
                {options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.label}
                    data-checked={value === option.value}
                    onSelect={() => {
                      onChange(option.value)
                      setOpen(false)
                    }}
                  >
                    {option.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </Field>
  )
}
