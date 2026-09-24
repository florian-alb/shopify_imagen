import { useState } from "react"
import { useAction } from "convex/react"
import { Check, Plus, Save, Sparkles } from "lucide-react"
import { api, type Doc } from "@/lib/convex"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type {
  Preparation,
  MenuNode,
  CollectionPlan,
} from "../../../../convex/catalogImport/model"
import { CatalogError } from "./CatalogShared"

export function MenuTree({
  nodes,
  onChange,
  depth = 0,
}: {
  nodes: MenuNode[]
  onChange?: (nodes: MenuNode[]) => void
  depth?: number
}) {
  function update(index: number, patch: Partial<MenuNode>) {
    onChange?.(nodes.map((n, i) => (i === index ? { ...n, ...patch } : n)))
  }
  function move(index: number, delta: number) {
    const next = [...nodes]
    ;[next[index], next[index + delta]] = [next[index + delta], next[index]]
    onChange?.(next)
  }
  return (
    <ul className={depth ? "ml-3 space-y-2 border-l pl-3" : "space-y-2"}>
      {nodes.map((node, index) => (
        <li key={node.key}>
          {onChange ? (
            <details>
              <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">
                {node.title}
              </summary>
              <div className="space-y-2 pb-3">
                <Input
                  aria-label={`Intitulé ${node.title}`}
                  value={node.title}
                  onChange={(e) => update(index, { title: e.target.value })}
                />
                <Input
                  aria-label={`Destination ${node.title}`}
                  value={node.url ?? ""}
                  placeholder="URL ou rubrique sans lien"
                  onChange={(e) =>
                    update(index, { url: e.target.value || null })
                  }
                />
                <div className="flex flex-wrap gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    aria-label={`Monter ${node.title}`}
                  >
                    ↑
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={index === nodes.length - 1}
                    onClick={() => move(index, 1)}
                    aria-label={`Descendre ${node.title}`}
                  >
                    ↓
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={depth >= 2}
                    onClick={() =>
                      update(index, {
                        children: [
                          ...node.children,
                          {
                            key: crypto.randomUUID(),
                            title: "Nouvelle rubrique",
                            url: null,
                            children: [],
                          },
                        ],
                      })
                    }
                  >
                    Sous-rubrique
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      onChange(nodes.filter((_, i) => i !== index))
                    }
                  >
                    Retirer
                  </Button>
                </div>
              </div>
              {node.children.length > 0 && (
                <MenuTree
                  nodes={node.children}
                  depth={depth + 1}
                  onChange={(children) => update(index, { children })}
                />
              )}
            </details>
          ) : (
            <span className="text-sm">{node.title}</span>
          )}
          {!onChange && node.children.length > 0 && (
            <MenuTree nodes={node.children} depth={depth + 1} />
          )}
        </li>
      ))}
      {onChange && depth === 0 && (
        <li>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              onChange([
                ...nodes,
                {
                  key: crypto.randomUUID(),
                  title: "Nouvelle rubrique",
                  url: null,
                  children: [],
                },
              ])
            }
          >
            Ajouter une rubrique
          </Button>
        </li>
      )}
    </ul>
  )
}
export function CatalogStructure({
  op,
  initial,
  onSaved,
}: {
  op: Doc<"catalogOperations">
  initial: Preparation
  onSaved: () => void
}) {
  const [prep, setPrep] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState("")
  const [page, setPage] = useState(0)
  const [tagDrafts, setTagDrafts] = useState<Record<string, string>>({})
  const [tokens, setTokens] = useState(0)
  const [aiOffset, setAiOffset] = useState(0)
  const save = useAction(api.catalogImportActions.saveStructure)
  const propose = useAction(api.catalogImportActions.proposeRules)
  const patch = (key: string, value: Partial<CollectionPlan>) =>
    setPrep((p) => ({
      ...p,
      collections: p.collections.map((c) =>
        c.key === key ? { ...c, ...value } : c,
      ),
    }))
  const editable = !["queued", "running"].includes(op.status)
  async function persist(collect: boolean) {
    setBusy(true)
    setError(null)
    try {
      await save({
        id: op._id,
        revision: op.revision,
        json: JSON.stringify(prep),
        collect,
      })
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible.")
    } finally {
      setBusy(false)
    }
  }
  async function proposals() {
    setBusy(true)
    setError(null)
    try {
      const result = await propose({ id: op._id, offset: aiOffset })
      setPrep((p) => ({
        ...p,
        collections: p.collections.map((c) => {
          const suggestion = result.proposals.find((s) => s.key === c.key)
          return suggestion && c.provenance !== "manual"
            ? {
                ...c,
                tags: suggestion.tags,
                match: suggestion.match,
                approved: false,
                provenance: "ai",
              }
            : c
        }),
      }))
      setTokens((t) => t + result.tokens)
      setAiOffset(result.nextOffset ?? 0)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Proposition impossible.")
    } finally {
      setBusy(false)
    }
  }
  const filtered = prep.collections.filter((c) =>
    c.targetTitle.toLowerCase().includes(filter.toLowerCase()),
  )
  return (
    <div className="grid min-w-0 gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="min-w-0">
        <details className="max-h-[70vh] overflow-y-auto">
          <summary className="mb-3 cursor-pointer text-sm font-medium">
            Afficher le menu
          </summary>
          <h2 className="mb-2 font-semibold">Menu source</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Les intitulés sont modifiables. Un lien peut apparaître à plusieurs
            endroits.
          </p>
          <MenuTree
            nodes={prep.menu}
            onChange={
              editable ? (menu) => setPrep((p) => ({ ...p, menu })) : undefined
            }
          />
        </details>
      </aside>
      <section className="min-w-0">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Collections et règles</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {prep.collections.filter((c) => c.selected).length} sélectionnées
              · {prep.collections.filter((c) => c.approved).length} règles
              validées
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={busy || !editable}
              onClick={() => void proposals()}
            >
              <Sparkles className="size-4" />
              {aiOffset ? "Proposer les 40 suivantes" : "Proposer les tags"}
            </Button>
            <Button
              variant="outline"
              disabled={!editable}
              onClick={() => {
                const key = `nouvelle-${Date.now()}`
                setPrep((p) => ({
                  ...p,
                  collections: [
                    ...p.collections,
                    {
                      key,
                      url: "",
                      title: "Nouvelle collection",
                      targetTitle: "Nouvelle collection",
                      keyword: "",
                      description: "",
                      seoTitle: "",
                      seoDescription: "",
                      image: null,
                      selected: true,
                      tags: [],
                      match: "all",
                      approved: false,
                      provenance: "manual",
                    },
                  ],
                }))
              }}
            >
              <Plus className="size-4" />
              Collection
            </Button>
          </div>
        </div>
        <p className="mb-4 text-xs leading-5 text-muted-foreground">
          L’IA traite au maximum 40 collections par clic, sans valider les
          règles à votre place. Les tags sont proposés uniquement en anglais.{" "}
          {tokens > 0
            ? `${tokens.toLocaleString("fr-FR")} tokens utilisés dans cette session.`
            : "Les corrections manuelles sont conservées."}
        </p>
        <Input
          aria-label="Filtrer les collections"
          placeholder="Rechercher une collection…"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value)
            setPage(0)
          }}
          className="mb-4 max-w-md"
        />
        {error && <CatalogError message={error} />}
        <div className="divide-y rounded-lg border">
          {filtered.slice(page * 20, (page + 1) * 20).map((c) => (
            <div key={c.key} className="space-y-3 p-4">
              <div className="flex items-center gap-3">
                <input
                  aria-label={`Sélectionner ${c.title}`}
                  type="checkbox"
                  checked={c.selected}
                  disabled={!editable}
                  onChange={(e) => patch(c.key, { selected: e.target.checked })}
                  className="size-4 accent-primary"
                />
                <Input
                  aria-label={`Titre de ${c.title}`}
                  value={c.targetTitle}
                  disabled={!editable}
                  onChange={(e) =>
                    patch(c.key, {
                      targetTitle: e.target.value,
                      provenance: "manual",
                    })
                  }
                  className="max-w-lg font-medium"
                />
                {c.approved && (
                  <Check
                    aria-label="Règle validée"
                    className="size-4 text-emerald-700"
                  />
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-sm">
                  <span>Requête SEO</span>
                  <Input
                    value={c.keyword}
                    disabled={!editable}
                    onChange={(e) =>
                      patch(c.key, {
                        keyword: e.target.value,
                        provenance: "manual",
                      })
                    }
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span>Tags en anglais, séparés par des virgules</span>
                  <Input
                    value={tagDrafts[c.key] ?? c.tags.join(", ")}
                    disabled={!editable}
                    onChange={(e) => {
                      setTagDrafts((d) => ({ ...d, [c.key]: e.target.value }))
                      patch(c.key, {
                        tags: e.target.value
                          .split(",")
                          .map((t) => t.trim())
                          .filter(Boolean),
                        approved: false,
                        provenance: "manual",
                      })
                    }}
                    placeholder="rabbit, large"
                  />
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <span>Conditions</span>
                  <select
                    className="h-9 rounded-md border bg-background px-2"
                    disabled={!editable}
                    value={c.match}
                    onChange={(e) =>
                      patch(c.key, {
                        match: e.target.value as "all" | "any",
                        approved: false,
                        provenance: "manual",
                      })
                    }
                  >
                    <option value="all">Tous les tags (ET)</option>
                    <option value="any">Un des tags (OU)</option>
                  </select>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    disabled={!editable || !c.tags.length}
                    checked={c.approved}
                    onChange={(e) =>
                      patch(c.key, { approved: e.target.checked })
                    }
                  />
                  Règle vérifiée
                </label>
                <label className="flex items-center gap-2 text-sm">
                  Taille minimum (cm)
                  <Input
                    aria-label={`Taille minimum pour ${c.targetTitle}`}
                    className="w-24"
                    type="number"
                    min="0"
                    value={c.minSizeCm ?? ""}
                    disabled={!editable}
                    onChange={(e) =>
                      patch(c.key, {
                        minSizeCm: e.target.value
                          ? Number(e.target.value)
                          : undefined,
                      })
                    }
                  />
                </label>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
          <span>
            {filtered.length} collections · page {page + 1}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              Précédent
            </Button>
            <Button
              variant="outline"
              disabled={(page + 1) * 20 >= filtered.length}
              onClick={() => setPage((p) => p + 1)}
            >
              Suivant
            </Button>
          </div>
        </div>
        <div className="sticky bottom-0 mt-4 flex flex-wrap items-center justify-between gap-3 border-t bg-background py-4">
          <p className="text-sm text-muted-foreground">
            Les règles restent modifiables après la collecte.
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={busy || !editable}
              onClick={() => void persist(false)}
            >
              <Save className="size-4" />
              Enregistrer
            </Button>
            {op.phase === "menu" && (
              <Button
                disabled={busy || !editable}
                onClick={() => void persist(true)}
              >
                Collecter les produits
              </Button>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
