import refund from "../templates/refund_policy.html?raw"
import privacy from "../templates/privacy.html?raw"
import shipping from "../templates/shipping.html?raw"
import contact from "../templates/contact.html?raw"
import legal from "../templates/legal_notice.html?raw"
import terms from "../templates/terms_of_sale.html?raw"
import type { PolicyValues } from "../defaults"
import { policyFields } from "../fields"
import { policyDocumentTitles, type PolicyLanguage } from "../languages"
import { isHttpsUrl, isPolicyLink } from "./validation"
import { policyLocales } from "../locales"

export const policyTemplates = [
  { id: "refund", title: "Retours et remboursements", filename: "retours-remboursements", html: refund },
  { id: "privacy", title: "Confidentialité", filename: "confidentialite", html: privacy },
  { id: "shipping", title: "Livraison", filename: "livraison", html: shipping },
  { id: "contact", title: "Contact", filename: "contact", html: contact },
  { id: "legal", title: "Mentions légales", filename: "mentions-legales", html: legal },
  { id: "terms", title: "CGV et CGU", filename: "conditions-generales", html: terms },
] as const

const translatedTemplates = import.meta.glob<string>("../templates/*/*.html", { eager: true, query: "?raw", import: "default" })
const templateFiles = ["refund_policy", "privacy", "shipping", "contact", "legal_notice", "terms_of_sale"]

export function getPolicyTemplateHtml(language: PolicyLanguage, index: number): string {
  if (language === "fr") return policyTemplates[index].html
  const html = translatedTemplates[`../templates/${language}/${templateFiles[index]}.html`]
  if (!html) throw new Error(`Modèle manquant : ${language}/${templateFiles[index]}`)
  return html
}

export type PolicyId = typeof policyTemplates[number]["id"]
export type GeneratedPolicy = { id: PolicyId; title: string; filename: string; html: string; language: PolicyLanguage }

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!)
}

function multiline(value: string): string {
  return escapeHtml(value).replace(/\r?\n/g, "<br>")
}

function list(value: string): string {
  return `<ul>\n${value.split(/\r?\n/).filter((line) => line.trim()).map((line) => `<li><p>${escapeHtml(line.trim())}</p></li>`).join("\n")}\n</ul>`
}

function resolveLink(path: string, site: string): string {
  if (!isPolicyLink(path)) return "#"
  if (isHttpsUrl(path)) return path
  if (!isHttpsUrl(site)) return path
  return new URL(path, new URL(site).origin).href
}

export function generatePolicies(values: PolicyValues, language: PolicyLanguage = "fr"): GeneratedPolicy[] {
  const pack = policyLocales[language]
  const phrases = pack.phrases
  const labels: Partial<Record<keyof PolicyValues, string>> = pack.labels
  const text = Object.fromEntries(policyFields.map((field) => [field.key, values[field.key].trim() || `[${labels[field.key] ?? phrases.missing}]`])) as PolicyValues
  const tokens: Record<string, string> = Object.fromEntries(Object.entries(text).map(([key, value]) => [key, escapeHtml(value)]))
  tokens.address = multiline(text.address)
  tokens.hostAddress = multiline(text.hostAddress)
  tokens.publisherName = escapeHtml(values.publisherName.trim() || text.operatorName)
  tokens.siret = escapeHtml(text.siret.replace(/\s/g, ""))
  tokens.phoneHref = escapeHtml(text.phone.replace(/[^+\d]/g, ""))
  tokens.websiteUrl = escapeHtml(isHttpsUrl(text.websiteUrl) ? text.websiteUrl : "#")
  tokens.contactUrl = escapeHtml(resolveLink(text.contactPath, text.websiteUrl))
  tokens.refundUrl = escapeHtml(resolveLink(text.refundPath, text.websiteUrl))
  tokens.privacyUrl = escapeHtml(resolveLink(text.privacyPath, text.websiteUrl))
  const date = new Date(`${values.updatedAt}T12:00:00Z`)
  tokens.updatedAt = Number.isNaN(date.getTime()) ? `[${labels.updatedAt}]` : escapeHtml(new Intl.DateTimeFormat(pack.locale, { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" }).format(date))
  for (const key of ["returnConditions", "packingInstructions", "rejectionReasons", "excludedProducts", "exchangeOptions"] as const) tokens[key] = list(text[key])
  const phrase = (value: string) => value.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    if (!(key in tokens)) throw new Error(`Variable de phrase inconnue : ${key}`)
    return tokens[key]
  })
  tokens.returnAddress = multiline(values.returnAddress.trim())
  tokens.returnAddressInstructions = values.returnAddress.trim() ? phrase(phrases.returnAddress) : phrases.returnAddressPending
  const paidByShop = values.returnFeePayer === "boutique"
  tokens.returnFeesIntro = phrase(paidByShop ? phrases.returnFeesShop : phrases.returnFeesClient)
  tokens.returnLabelInstructions = phrase(paidByShop ? phrases.returnLabelShop : phrases.returnLabelClient)
  tokens.exchangeFees = phrase(paidByShop ? phrases.exchangeFeesShop : phrases.exchangeFeesClient)
  const fee = Number(values.shippingFee)
  const formattedFee = Number.isFinite(fee) && fee >= 0 ? new Intl.NumberFormat(pack.locale, { style: "currency", currency: "EUR" }).format(fee) : `[${labels.shippingFee}]`
  tokens.shippingFee = escapeHtml(formattedFee)
  tokens.shippingFeeDescription = phrase(fee === 0 ? phrases.shippingFree : phrases.shippingPaid)
  tokens.supportStart = escapeHtml(language === "fr" ? text.supportStart.replace(":", "h") : text.supportStart)
  tokens.supportEnd = escapeHtml(language === "fr" ? text.supportEnd.replace(":", "h") : text.supportEnd)
  const creatorEmail = escapeHtml(values.creatorEmail.trim() || text.email)
  const creatorPhone = values.creatorPhone.trim() || text.phone
  tokens.creatorDetails = `<strong>${phrases.creator} :</strong><br>${escapeHtml(values.creatorName.trim() || text.operatorName)}<br><strong>${phrases.address} :</strong> ${multiline(values.creatorAddress.trim() || text.address)}<br><strong>${phrases.phone} :</strong> <a href="tel:${escapeHtml(creatorPhone.replace(/[^+\d]/g, ""))}">${escapeHtml(creatorPhone)}</a><br><strong>${phrases.email} :</strong> <a href="mailto:${creatorEmail}">${creatorEmail}</a>`
  return policyTemplates.map((template, index) => ({
    ...template,
    title: policyDocumentTitles[language].policies[index],
    filename: `${template.filename}${language === "fr" ? "" : `-${language}`}`,
    language,
    html: getPolicyTemplateHtml(language, index).replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
      if (!(key in tokens)) throw new Error(`Variable de modèle inconnue : ${key}`)
      return tokens[key]
    }),
  }))
}

export function buildPolicyDocument(policies: GeneratedPolicy[], storeName: string): string {
  if (!policies.length || policies.some((policy) => policy.language !== policies[0].language)) throw new Error("Les documents doivent être dans la même langue.")
  const language = policies[0].language
  const title = policies.length === 1 ? policies[0].title : policyDocumentTitles[language].bundle
  const navigation = policies.length > 1 ? `<nav aria-label="Documents">${policies.map((policy) => `<a href="#${policy.id}">${escapeHtml(policy.title)}</a>`).join(" · ")}</nav>` : ""
  return `<!doctype html>\n<html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} — ${escapeHtml(storeName)}</title><style>body{font:16px/1.65 system-ui,sans-serif;max-width:850px;margin:auto;padding:32px;color:#222;overflow-wrap:anywhere}h1{font-size:1.8rem;line-height:1.3}h2{font-size:1.3rem;margin-top:2rem}h3{font-size:1.1rem}a{color:inherit}article+article{border-top:1px solid #ddd;margin-top:64px;padding-top:32px}nav{margin-bottom:32px}li p{margin:0.4rem 0}@media print{nav{display:none}article+article{break-before:page}}</style></head><body>${navigation}${policies.map((policy) => `<article id="${policy.id}">${policy.html}</article>`).join("\n")}</body></html>`
}

export function buildPolicyPreview(policy: GeneratedPolicy, storeName: string): string {
  return buildPolicyDocument([policy], storeName).replace("<head>", '<head><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;"><style>a{pointer-events:none}</style>')
}
