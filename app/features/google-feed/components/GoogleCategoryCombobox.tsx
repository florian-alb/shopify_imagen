import { useAction } from "convex/react"
import { Check, ChevronsUpDown, LoaderCircle } from "lucide-react"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { api } from "@/lib/convex"
import { cn } from "@/lib/utils"

type TaxonomyItem = { id: string; label: string }

export function GoogleCategoryCombobox({
  value,
  disabled = false,
  compact = false,
  onChange,
}: {
  value: string | null
  disabled?: boolean
  compact?: boolean
  onChange: (value: string) => void
}) {
  const searchTaxonomy = useAction(api.googleFeedActions.searchTaxonomy)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(value ?? "")
  const [items, setItems] = useState<TaxonomyItem[]>([])
  const [loading, setLoading] = useState(false)
  const [sourceVersion, setSourceVersion] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      setLoading(true)
      void searchTaxonomy({ query, limit: 30 })
        .then((result) => {
          if (cancelled) return
          setItems(result.items)
          setSourceVersion(result.version)
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [open, query, searchTaxonomy])

  const selected = items.find((item) => item.id === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "justify-between font-normal",
            compact ? "h-8 w-full min-w-40 px-2" : "w-full",
            value && "border-primary/40 bg-primary/5",
          )}
        >
          <span className="truncate">
            {selected ? `${selected.id} · ${selected.label}` : value || "Non renseigné"}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(34rem,calc(100vw-2rem))] p-0">
        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="ID ou libellé de catégorie…"
          />
          <CommandList>
            {loading ? (
              <div className="flex items-center gap-2 px-3 py-6 text-sm text-muted-foreground">
                <LoaderCircle className="size-4 animate-spin" />
                Recherche dans la taxonomie officielle Google…
              </div>
            ) : null}
            {!loading ? <CommandEmpty>Aucune catégorie trouvée.</CommandEmpty> : null}
            {!loading
              ? items.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={item.id}
                    onSelect={() => {
                      onChange(item.id)
                      setOpen(false)
                    }}
                  >
                    <Check
                      className={cn(
                        "size-4",
                        value === item.id ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="font-mono text-xs">{item.id}</span>
                    <span className="min-w-0 truncate">{item.label}</span>
                  </CommandItem>
                ))
              : null}
          </CommandList>
          {sourceVersion ? (
            <p className="border-t px-3 py-2 text-xs text-muted-foreground">
              Source Google · {sourceVersion}
            </p>
          ) : null}
        </Command>
      </PopoverContent>
    </Popover>
  )
}
