import { useState } from "react"
import { toast } from "sonner"
import { getPolicyDate, initialPolicyValues, type PolicyFieldKey, type PolicyValues } from "../defaults"
import { buildPolicyDocument, generatePolicies, type PolicyId } from "../lib/generate"
import { validatePolicyValues } from "../lib/validation"
import { policyLanguages, type PolicyLanguage } from "../languages"
import { getLocalizedPolicyValues, getProductProfile, isLocalizedPolicyKey, type PolicyTextOverrides } from "../locales"

export function usePolicyGenerator() {
  const [sharedValues, setSharedValues] = useState<PolicyValues>(() => ({ ...initialPolicyValues, updatedAt: getPolicyDate() }))
  const [language, setLanguage] = useState<PolicyLanguage>("fr")
  const [textOverrides, setTextOverrides] = useState<PolicyTextOverrides>({})
  const [activePolicy, setActivePolicy] = useState<PolicyId>("refund")
  const [showErrors, setShowErrors] = useState(false)
  const values = getLocalizedPolicyValues(sharedValues, language, textOverrides)
  const errors = validatePolicyValues(values)
  const policies = generatePolicies(values, language)
  const selectedPolicy = policies.find((policy) => policy.id === activePolicy)!
  const isComplete = Object.keys(errors).length === 0
  const update = (key: PolicyFieldKey, value: string) => {
    if (isLocalizedPolicyKey(key)) {
      setTextOverrides((current) => ({ ...current, [language]: { ...current[language], [key]: value } }))
    } else {
      setSharedValues((current) => ({ ...current, [key]: value }))
    }
  }
  const reset = () => {
    setSharedValues({ ...initialPolicyValues, updatedAt: getPolicyDate() })
    setTextOverrides({})
    setShowErrors(false)
  }
  const applyProfile = (profile: "generic" | "shoes") => {
    setTextOverrides((current) => Object.fromEntries(policyLanguages.map(({ code }) => [code, { ...current[code], ...getProductProfile(code, profile) }])))
    toast.success("Passages produits mis à jour")
  }
  const checkExport = () => {
    setShowErrors(true)
    if (isComplete) return true
    toast.error("Complétez les champs signalés avant d’exporter.")
    return false
  }
  const copy = async () => {
    if (!checkExport()) return
    try {
      await navigator.clipboard.writeText(selectedPolicy.html)
      toast.success("HTML copié — prêt à coller dans Shopify")
    } catch {
      toast.error("Copie indisponible. Utilisez l’onglet HTML ou téléchargez le document.")
    }
  }
  const download = (all = false) => {
    if (!checkExport()) return
    const document = buildPolicyDocument(all ? policies : [selectedPolicy], values.storeName)
    const url = URL.createObjectURL(new Blob([document], { type: "text/html;charset=utf-8" }))
    const anchor = window.document.createElement("a")
    anchor.href = url
    anchor.download = `${all ? `politiques${language === "fr" ? "" : `-${language}`}` : selectedPolicy.filename}.html`
    window.document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    toast.success(all ? "Les six documents ont été téléchargés" : "Document téléchargé")
  }
  return { language, setLanguage, values, update, reset, applyProfile, errors, showErrors, setShowErrors, isComplete, policies, selectedPolicy, activePolicy, setActivePolicy, copy, download }
}
