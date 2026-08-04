import { Link } from "@tanstack/react-router"
import { useAction, useMutation, useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { Copy, Eye, Plus, Play, Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { EmptyState, StateBadge } from "@/components/page"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { api, type Id } from "@/lib/convex"
import { cn } from "@/lib/utils"

import { attributeLabels } from "../constants"
import { GoogleFeedPageFrame } from "./GoogleFeedPageFrame"
import { emptyRuleDraft, RuleBuilder, type RuleDraft } from "./RuleBuilder"

type RuleRow = FunctionReturnType<typeof api.googleFeed.listRules>[number]

function toDraft(rule: RuleRow): RuleDraft {
  return {
    name: rule.name,
    active: rule.active,
    priority: rule.priority,
    target: rule.target,
    attribute: rule.attribute,
    conditionMode: rule.conditionMode,
    conditions: rule.conditions.map((condition) => ({
      field: condition.field,
      operator: condition.operator,
      value: condition.value ?? condition.values?.join(", ") ?? "",
      min: condition.min?.toString() ?? "",
      max: condition.max?.toString() ?? "",
    })),
    value: rule.value,
    overwritePolicy: rule.overwritePolicy,
  }
}

export function GoogleFeedRulesPage() {
  const rules = useQuery(api.googleFeed.listRules)
  const saveRule = useMutation(api.googleFeed.saveRule)
  const duplicateRule = useMutation(api.googleFeed.duplicateRule)
  const deleteRule = useMutation(api.googleFeed.deleteRule)
  const evaluateRules = useAction(api.googleFeedActions.evaluateRules)
  const [selectedId, setSelectedId] = useState<Id<"googleFeedRules"> | null>(null)
  const [draft, setDraft] = useState<RuleDraft>(emptyRuleDraft)
  const [saving, setSaving] = useState(false)
  const [evaluating, setEvaluating] = useState(false)
  const selected = rules?.find((rule) => rule.id === selectedId) ?? null

  async function save() {
    setSaving(true)
    try {
      const ruleId = await saveRule({
        ruleId: selectedId ?? undefined,
        rule: {
          name: draft.name,
          active: draft.active,
          priority: draft.priority,
          target: draft.target,
          attribute: draft.attribute,
          conditionMode: draft.conditionMode,
          conditions: draft.conditions.map((condition) => ({
            field: condition.field,
            operator: condition.operator,
            ...(condition.operator === "between"
              ? { min: Number(condition.min), max: Number(condition.max) }
              : condition.operator === "in"
                ? { values: condition.value.split(",").map((value) => value.trim()).filter(Boolean) }
                : condition.operator === "empty" || condition.operator === "not_empty"
                  ? {}
                  : { value: condition.value }),
          })),
          value: draft.value,
          overwritePolicy: draft.overwritePolicy,
        },
      })
      setSelectedId(ruleId)
      toast.success("Règle enregistrée", { description: "Aucune donnée Shopify n’a été modifiée." })
    } catch (error) {
      toast.error("Règle invalide", { description: error instanceof Error ? error.message : String(error) })
    } finally {
      setSaving(false)
    }
  }

  async function apply() {
    setEvaluating(true)
    try {
      const result = await evaluateRules({})
      toast.success("Règles appliquées au brouillon", { description: `${result.proposed} propositions à prévisualiser.` })
    } catch (error) {
      toast.error("Évaluation impossible", { description: error instanceof Error ? error.message : String(error) })
    } finally {
      setEvaluating(false)
    }
  }

  return (
    <GoogleFeedPageFrame active="rules">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div>
          <p className="font-medium">Règles de la boutique active</p>
          <p className="mt-1 text-sm text-muted-foreground">Priorités stables, conditions déterministes et aperçu avant publication.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => { setSelectedId(null); setDraft(emptyRuleDraft()) }}>
            <Plus data-icon="inline-start" />Nouvelle règle
          </Button>
          <Button type="button" disabled={evaluating || !rules?.some((rule) => rule.active)} onClick={() => void apply()}>
            <Play data-icon="inline-start" />{evaluating ? "Évaluation…" : "Appliquer au catalogue"}
          </Button>
          <Button asChild variant="outline"><Link to="/google-feed/preview" search={{ status: "all", page: 1 }}><Eye data-icon="inline-start" />Voir l’aperçu</Link></Button>
        </div>
      </div>
      {rules === undefined ? (
        <EmptyState loading title="Chargement des règles" body="Lecture des règles propres à la boutique active." />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[19rem_minmax(0,1fr)]">
          <Card className="h-fit gap-0 overflow-hidden rounded-lg p-0">
            <div className="border-b px-4 py-3 text-sm font-medium">{rules.length} règle{rules.length === 1 ? "" : "s"}</div>
            <div className="divide-y">
              {rules.length === 0 ? <p className="p-4 text-sm text-muted-foreground">Créez votre première règle. Aucune correspondance métier n’est codée en dur.</p> : null}
              {rules.map((rule) => (
                <button key={rule.id} type="button" className={cn("block w-full px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", selectedId === rule.id && "bg-primary/8")} onClick={() => { setSelectedId(rule.id); setDraft(toDraft(rule)) }}>
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-medium">{rule.priority}. {rule.name}</span>
                    <StateBadge state={rule.active ? "success" : "neutral"}>{rule.active ? "Active" : "Inactive"}</StateBadge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{attributeLabels[rule.attribute]} · {rule.conditions.length} condition{rule.conditions.length === 1 ? "" : "s"}</p>
                </button>
              ))}
            </div>
          </Card>
          <Card className="rounded-lg p-4 sm:p-5">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b pb-4">
              <div><h2 className="text-lg font-semibold">{selected ? selected.name : "Nouvelle règle"}</h2><p className="mt-1 text-sm text-muted-foreground">L’éditeur se lit comme une phrase métier.</p></div>
              {selected ? (
                <div className="flex gap-1">
                  <Button type="button" variant="ghost" size="sm" onClick={() => void duplicateRule({ ruleId: selected.id }).then((id) => setSelectedId(id))}><Copy data-icon="inline-start" />Dupliquer</Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild><Button type="button" variant="ghost" size="sm"><Trash2 data-icon="inline-start" />Supprimer</Button></AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader><AlertDialogTitle>Supprimer « {selected.name} » ?</AlertDialogTitle><AlertDialogDescription>Les brouillons déjà créés restent visibles, mais cette règle ne sera plus évaluée.</AlertDialogDescription></AlertDialogHeader>
                      <AlertDialogFooter><AlertDialogCancel>Annuler</AlertDialogCancel><AlertDialogAction onClick={() => void deleteRule({ ruleId: selected.id }).then(() => { setSelectedId(null); setDraft(emptyRuleDraft()) })}>Supprimer</AlertDialogAction></AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ) : null}
            </div>
            <RuleBuilder draft={draft} saving={saving} onChange={setDraft} onSave={() => void save()} />
          </Card>
        </div>
      )}
    </GoogleFeedPageFrame>
  )
}
