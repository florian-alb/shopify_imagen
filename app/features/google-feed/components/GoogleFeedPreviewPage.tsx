import { Link, useNavigate } from "@tanstack/react-router"
import { useAction, useMutation, useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { ArrowLeft, CheckCircle2, Send, Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { EmptyState, NumberedPaginator, PageHeader, StateBadge, pageContentClass } from "@/components/page"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { api } from "@/lib/convex"

import { ageGroupOptions, attributeLabels, genderOptions, statusLabels } from "../constants"
import type { GoogleFeedPreviewSearch } from "../lib/search"
import { GoogleCategoryCombobox } from "./GoogleCategoryCombobox"
import { GoogleValueSelect } from "./GoogleValueSelect"

const previewFilters = [
  { value: "all", label: "Toutes" },
  { value: "ready", label: "Prêtes" },
  { value: "conflict", label: "Conflits" },
  { value: "invalid", label: "Invalides" },
  { value: "excluded", label: "Exclues" },
] as const

export function GoogleFeedPreviewPage({ search }: { search: GoogleFeedPreviewSearch }) {
  const navigate = useNavigate()
  const preview = useQuery(api.googleFeed.preview, {
    offset: (search.page - 1) * 50,
    limit: 50,
    status: search.status,
  })
  const setInclusion = useMutation(api.googleFeed.setDraftInclusion)
  const updateValue = useMutation(api.googleFeed.updateDraftValue)
  const discardDraft = useMutation(api.googleFeed.discardDraft)
  const publish = useAction(api.googleFeedActions.publish)
  const [publishing, setPublishing] = useState(false)

  function updateSearch(patch: Partial<GoogleFeedPreviewSearch>) {
    void navigate({ to: "/google-feed/preview", search: { ...search, ...patch }, replace: true })
  }

  async function publishReady() {
    setPublishing(true)
    try {
      const result = await publish({})
      if (result.failed > 0) {
        toast.warning("Publication partielle", { description: `${result.published} confirmées · ${result.failed} en erreur.` })
      } else {
        toast.success("Publication confirmée", { description: `${result.published} valeurs relues dans Shopify.` })
      }
      void navigate({ to: "/google-feed/history" })
    } catch (error) {
      toast.error("Publication impossible", { description: error instanceof Error ? error.message : String(error) })
    } finally {
      setPublishing(false)
    }
  }

  return (
    <main className={pageContentClass}>
      <PageHeader
        title="Prévisualisation"
        eyebrow="Flux Google"
        action={
          <>
            <Button variant="outline" asChild><Link to="/google-feed" search={{ view: "all", page: 1, size: 20 }}><ArrowLeft data-icon="inline-start" />Retour au catalogue</Link></Button>
            <Button disabled={publishing || !preview?.readyCount} onClick={() => void publishReady()}>
              <Send data-icon="inline-start" />
              {publishing ? "Publication…" : `Publier ${preview?.readyCount ?? 0} modifications`}
            </Button>
          </>
        }
      >
        Vérifiez chaque différence avant toute écriture Shopify. Les lignes sont relues après publication.
      </PageHeader>

      {preview ? (
        <p className="mb-4 border-y py-3 text-sm" aria-live="polite">
          <strong>{preview.readyCount} modifications prêtes</strong>
          <span className="text-muted-foreground"> · {preview.conflictCount} conflits · {preview.invalidCount} invalides · {preview.excludedCount} exclues</span>
        </p>
      ) : null}
      <SegmentedControl
        className="mb-4 w-full sm:w-auto"
        value={search.status}
        options={previewFilters}
        ariaLabel="Filtrer la prévisualisation"
        onValueChange={(status) => updateSearch({ status: status as GoogleFeedPreviewSearch["status"], page: 1 })}
      />

      {preview === undefined ? (
        <EmptyState loading title="Préparation de l’aperçu" body="Comparaison des valeurs Shopify et des propositions." />
      ) : preview.page.length === 0 ? (
        <EmptyState title="Aucune modification dans cette vue" body="Revenez au catalogue pour éditer une valeur ou appliquez les règles de la boutique.">
          <Button asChild><Link to="/google-feed" search={{ view: "all", page: 1, size: 20 }}>Voir le catalogue</Link></Button>
        </EmptyState>
      ) : (
        <>
          <Card className="hidden overflow-x-auto rounded-lg lg:block">
            <Table className="min-w-[1050px]">
              <TableHeader><TableRow><TableHead className="w-16">Inclure</TableHead><TableHead className="min-w-64">Produit ou variante</TableHead><TableHead>Attribut</TableHead><TableHead>Shopify</TableHead><TableHead className="min-w-64">Proposition</TableHead><TableHead>Origine</TableHead><TableHead>État</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
              <TableBody>
                {preview.page.map((row) => (
                  <TableRow key={row.id} className={!row.included ? "opacity-60" : undefined}>
                    <TableCell><Checkbox checked={row.included} aria-label={`Inclure ${row.productTitle}`} onCheckedChange={(checked) => void setInclusion({ draftId: row.id, included: checked === true })} /></TableCell>
                    <TableCell><p className="font-medium">{row.variantTitle ?? row.productTitle}</p>{row.variantTitle ? <p className="mt-1 text-xs text-muted-foreground">{row.productTitle}</p> : null}</TableCell>
                    <TableCell>{attributeLabels[row.attribute]}</TableCell>
                    <TableCell><span className="rounded-md bg-muted px-2 py-1 font-mono text-xs">{row.currentValue ?? "vide"}</span></TableCell>
                    <TableCell><PreviewValueEditor row={row} onChange={(value) => void updateValue({ draftId: row.id, value })} /></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{row.sourceLabel}</TableCell>
                    <TableCell><PreviewStatus status={row.status} error={row.error} /></TableCell>
                    <TableCell className="text-right"><Button type="button" size="icon-sm" variant="ghost" aria-label="Retirer la proposition" onClick={() => void discardDraft({ draftId: row.id })}><Trash2 /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          <div className="grid gap-3 lg:hidden">
            {preview.page.map((row) => (
              <Card key={row.id} className="gap-4 rounded-lg p-4">
                <div className="flex items-start justify-between gap-3"><div><p className="font-medium">{row.variantTitle ?? row.productTitle}</p><p className="mt-1 text-xs text-muted-foreground">{attributeLabels[row.attribute]} · {row.sourceLabel}</p></div><Checkbox checked={row.included} aria-label="Inclure dans la publication" onCheckedChange={(checked) => void setInclusion({ draftId: row.id, included: checked === true })} /></div>
                <div className="grid gap-3 sm:grid-cols-2"><div><p className="mb-1 text-xs text-muted-foreground">Shopify</p><p className="font-mono text-sm">{row.currentValue ?? "vide"}</p></div><div><p className="mb-1 text-xs text-muted-foreground">Proposition</p><PreviewValueEditor row={row} onChange={(value) => void updateValue({ draftId: row.id, value })} /></div></div>
                <div className="flex items-center justify-between gap-3 border-t pt-3"><PreviewStatus status={row.status} error={row.error} /><Button type="button" variant="ghost" size="sm" onClick={() => void discardDraft({ draftId: row.id })}><Trash2 data-icon="inline-start" />Retirer</Button></div>
              </Card>
            ))}
          </div>
          <NumberedPaginator page={search.page} pageSize={50} hasPrevious={preview.hasPrevious} hasNext={preview.hasNext} onPageChange={(page) => updateSearch({ page })} />
        </>
      )}
      {preview?.readyCount ? (
        <div className="sticky bottom-3 z-20 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background p-3 shadow-sm">
          <div className="flex items-center gap-2 text-sm"><CheckCircle2 className="size-4 text-emerald-600" /><strong>{preview.readyCount} modifications publiables</strong></div>
          <Button disabled={publishing} onClick={() => void publishReady()}><Send data-icon="inline-start" />{publishing ? "Publication…" : `Publier ${preview.readyCount} modifications`}</Button>
        </div>
      ) : null}
    </main>
  )
}

type PreviewRow = FunctionReturnType<typeof api.googleFeed.preview>["page"][number]

function PreviewValueEditor({ row, onChange }: { row: PreviewRow; onChange: (value: string) => void }) {
  if (row.attribute === "google_product_category") return <GoogleCategoryCombobox compact value={row.proposedValue} onChange={onChange} />
  return <GoogleValueSelect value={row.proposedValue} options={row.attribute === "gender" ? genderOptions : ageGroupOptions} label={`Corriger ${attributeLabels[row.attribute]}`} onChange={onChange} />
}

function PreviewStatus({ status, error }: { status: PreviewRow["status"]; error: string | null }) {
  const state = status === "conflict" || status === "invalid" || status === "failed" ? "danger" : status === "confirmed" ? "success" : "warning"
  return <div><StateBadge state={state}>{statusLabels[status]}</StateBadge>{error ? <p className="mt-1 max-w-56 text-xs text-destructive">{error}</p> : null}</div>
}
