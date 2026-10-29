import type { SourceScope } from "../../../../convex/catalogue/scope"

const regions = new Intl.DisplayNames(["fr"], { type: "region" })
const languages = new Intl.DisplayNames(["fr"], { type: "language" })
export const marketKey = (scope: SourceScope) => scope.market ?? "principal"
export const languageKey = (scope: SourceScope) => scope.language ?? "unknown"
export const marketLabel = (key: string) => key === "principal" ? "Marché principal" : regions.of(key) ?? key
export const languageLabel = (key: string) => key === "unknown" ? "Langue principale non précisée" : languages.of(key) ?? key
export function sourceScopeLabel(scope?: SourceScope) {
  if (!scope) return "Marchés et langues non segmentés"
  return `${marketLabel(marketKey(scope))} · ${languageLabel(languageKey(scope))}`
}
export function selectedScopes(scopes: SourceScope[], market: string, language: string) {
  return scopes.filter((s) => (market === "all" || marketKey(s) === market)
    && (language === "all" || languageKey(s) === language))
}
