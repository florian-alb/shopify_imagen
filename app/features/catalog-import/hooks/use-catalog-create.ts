import { useState } from "react"
import { useAction, useMutation } from "convex/react"
import { useNavigate } from "@tanstack/react-router"
import { api } from "@/lib/convex"
import { errorMessage } from "@/lib/errors"
import type { SourceScope } from "../../../../convex/catalogue/scope"
import type { TagLanguage } from "../../../../convex/catalogue/tags"
import { marketKey, selectedScopes } from "../lib/source-scope"

export function useCatalogCreate() {
  const discover = useAction(api.catalogueActions.discoverMarkets)
  const create = useMutation(api.catalogues.createSegmented)
  const navigate = useNavigate()
  const [form, setForm] = useState({ url: "", mode: "ALL" as "ALL" | "TOP_N", n: "25", tagLanguage: "en" as TagLanguage })
  const [source, setSource] = useState<{ origin: string; scopes: SourceScope[] } | null>(null)
  const [filter, setFilter] = useState({ market: "all", language: "all" })
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState({ error: "", success: "" })
  const scopes = source ? selectedScopes(source.scopes, filter.market, filter.language) : []

  function changeUrl(url: string) {
    setForm((current) => ({ ...current, url }))
    setSource(null)
    setFeedback({ error: "", success: "" })
  }
  async function submit() {
    setBusy(true)
    setFeedback({ error: "", success: "" })
    try {
      if (!source) {
        const result = await discover({ url: form.url })
        setSource(result)
        setFilter({ market: marketKey(result.scopes[0]), language: "all" })
        return
      }
      if (form.mode === "TOP_N" && !/^[1-9]\d*$/.test(form.n))
        throw new Error("Indiquez un entier strictement positif.")
      if (!scopes.length) throw new Error("Aucun segment ne correspond à cette sélection.")
      const ids = await create({
        url: source.origin, mode: form.mode, scopes, tagLanguage: form.tagLanguage,
        ...(form.mode === "TOP_N" ? { topN: Number(form.n) } : {}),
      })
      if (ids.length === 1) {
        await navigate({ to: "/catalog-import/$exportId", params: { exportId: ids[0] } })
      } else {
        setSource(null)
        setFeedback({ error: "", success: `${ids.length} catalogues créés. Retrouvez chaque marché et langue dans la liste ci-dessous.` })
      }
    } catch (e) {
      setFeedback({ error: errorMessage(e), success: "" })
    } finally { setBusy(false) }
  }
  return { form, setForm, source, filter, setFilter, busy, feedback, scopes, changeUrl, submit }
}
