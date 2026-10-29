import { ArrowRight } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel, FieldSet, FieldLegend } from "@/components/ui/field"
import { TagLanguageSelect } from "./TagLanguageSelect"
import { CatalogSourceScopes } from "./CatalogSourceScopes"
import { useCatalogCreate } from "../hooks/use-catalog-create"

export function CatalogCreateForm() {
  const { form, setForm, source, filter, setFilter, busy, feedback, scopes, changeUrl, submit } = useCatalogCreate()
  const { mode, n, tagLanguage } = form
  return (
    <form className="studio-panel flex max-w-3xl flex-col gap-6 p-5 sm:p-8" onSubmit={(e) => { e.preventDefault(); void submit() }}>
      <Field>
        <FieldLabel htmlFor="catalogue-source-url">Boutique source</FieldLabel>
        <Input id="catalogue-source-url" type="url" value={form.url} onChange={(e) => changeUrl(e.target.value)} placeholder="https://www.site.com/sitemap.xml" required autoComplete="url" disabled={busy} />
      </Field>
      {source && <>
        <CatalogSourceScopes scopes={source.scopes} value={filter} onChange={setFilter} disabled={busy} />
        <div className="flex max-w-xs flex-col gap-2">
          <TagLanguageSelect value={tagLanguage} onChange={(value) => setForm({ ...form, tagLanguage: value })} disabled={busy} />
          <p className="text-sm text-muted-foreground">La langue des tags est indépendante de celle des fiches source.</p>
        </div>
        <FieldSet disabled={busy}>
          <FieldLegend variant="label">Produits à récupérer par catalogue</FieldLegend>
          <label className="flex items-center gap-3 text-sm">
            <input className="size-4 accent-primary" type="radio" name="catalogue-mode" checked={mode === "ALL"} onChange={() => setForm({ ...form, mode: "ALL" })} />
            Tout le catalogue
          </label>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-3 text-sm">
              <input className="size-4 accent-primary" type="radio" name="catalogue-mode" checked={mode === "TOP_N"} onChange={() => setForm({ ...form, mode: "TOP_N" })} />
              Les meilleures ventes
            </label>
            {mode === "TOP_N" && <label className="flex items-center gap-2 text-sm">
              Nombre de produits
              <Input className="w-24" type="number" min="1" step="1" value={n} onChange={(e) => setForm({ ...form, n: e.target.value })} required />
            </label>}
          </div>
        </FieldSet>
        <p className="text-sm text-muted-foreground">Le menu et les collections du segment sont conservés dans les deux modes.</p>
      </>}
      {feedback.error && <p role="alert" className="text-sm text-destructive">{feedback.error}</p>}
      {feedback.success && <p role="status" className="text-sm">{feedback.success}</p>}
      <Button className="self-start" disabled={busy || !!source && !scopes.length}>
        {busy ? source ? "Lancement…" : "Lecture du sitemap…" : !source ? "Détecter les marchés et langues" : scopes.length > 1 ? `Créer ${scopes.length} catalogues` : "Analyser ce segment"}
        <ArrowRight data-icon="inline-end" />
      </Button>
    </form>
  )
}
