import { describe, expect, it } from "vitest"
import { load } from "cheerio"
import { initialPolicyValues } from "../defaults"
import { policyLanguages } from "../languages"
import { getLocalizedPolicyValues, getProductProfile, policyLocales } from "../locales"
import { buildPolicyDocument, generatePolicies, getPolicyTemplateHtml, policyTemplates } from "./generate"

const shared = { ...initialPolicyValues, storeName: "Atelier & Lin", operatorName: "Société du Lin", publisherName: "Camille Martin", websiteUrl: "https://example.com", address: "12 rue des Ateliers\n69002 Lyon", email: "bonjour@example.com", phone: "+33 4 12 34 56 78", updatedAt: "2026-10-02", returnDays: "45", shippingFee: "4.90" }
const headings = ["Politique de retour et de remboursement", "Returns and refunds policy", "Rückgabe- und Erstattungsrichtlinie", "Política de devoluciones y reembolsos", "Politica di reso e rimborso", "Retour- en terugbetalingsbeleid"]
const tokens = (html: string) => [...new Set([...html.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]))].sort()
const externalLinks = (html: string) => [...load(html)("a[href^='https://']")].map((element) => load(element).root().find("a").attr("href")).sort()

describe("pretranslated policy models", () => {
  it.each(policyLanguages.map((language, index) => ({ ...language, heading: headings[index] })))("generates six complete $code documents immediately, including draft placeholders", ({ code, heading }) => {
    const values = getLocalizedPolicyValues(shared, code)
    const policies = generatePolicies(values, code)
    expect(policies).toHaveLength(6)
    expect(load(policies[0].html)("h1").text()).toBe(heading)
    for (const policy of policies) {
      expect(policy.language).toBe(code)
      expect(policy.html).not.toMatch(/\{\{\w+\}\}|Maison Patine|maison-patine|Nougaro/)
      expect(policy.html).toContain("Atelier &amp; Lin")
      expect(policy.html).toContain("Camille Martin")
      expect(policy.html).toContain("bonjour@example.com")
      expect(policy.html).toContain("tel:+33412345678")
    }
    expect(policies[0].html).toContain("45")
    expect(policies[1].html).toContain(new Intl.DateTimeFormat(policyLocales[code].locale, { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" }).format(new Date("2026-10-02T12:00:00Z")))
    expect(policies[2].html).toContain(new Intl.NumberFormat(policyLocales[code].locale, { style: "currency", currency: "EUR" }).format(4.9))
    expect(buildPolicyDocument(policies, values.storeName)).toContain(`<html lang="${code}">`)
    const drafts = generatePolicies(getLocalizedPolicyValues(initialPolicyValues, code), code)
    expect(drafts).toHaveLength(6)
    expect(drafts[0].html).toContain(`[${policyLocales[code].labels.storeName}]`)
    if (code !== "fr") {
      expect(policies[0].filename).toMatch(new RegExp(`-${code}$`))
      expect(policies.map((policy) => policy.html).join("\n")).not.toMatch(/heures ouvrées|jours ouvrés|à la charge du client|Date de mise à jour/)
    }
  })

  it.each(policyLanguages.filter(({ code }) => code !== "fr"))("preserves the variables, sections and legal links of all six source models in $code", ({ code }) => {
    policyTemplates.forEach((template, index) => {
      const translated = getPolicyTemplateHtml(code, index)
      expect(tokens(translated)).toEqual(tokens(template.html))
      const source = load(template.html)
      const target = load(translated)
      for (const tag of ["h1", "h2", "h3"]) expect(target(tag).length).toBe(source(tag).length)
      expect(externalLinks(translated)).toEqual(externalLinks(template.html))
      expect(target("section").attr("class")).toBe(source("section").attr("class"))
    })
  })

  it.each(policyLanguages)("localizes product presets and variable branches safely in $code", ({ code }) => {
    const pack = policyLocales[code]
    const values = { ...getLocalizedPolicyValues(shared, code), ...getProductProfile(code, "shoes"), returnFeePayer: "boutique", returnAddress: "8 rue <Retour>\n75001 Paris", shippingFee: "0", creatorName: "Studio & Partners" }
    const policies = generatePolicies(values, code)
    expect(policies[0].html).toContain("8 rue &lt;Retour&gt;<br>75001 Paris")
    expect(policies[0].html).toContain(pack.phrases.returnLabelShop.replace("{{storeName}}", "Atelier &amp; Lin"))
    expect(policies[2].html).toContain(pack.phrases.shippingFree.replace("{{shippingCountry}}", values.shippingCountry))
    expect(policies[4].html).toContain(pack.phrases.creator)
    expect(policies[4].html).toContain("Studio &amp; Partners")
    expect(load(policies[0].html)("li").text()).toContain(pack.shoes.exchangeOptions.split("\n")[0])
    expect(load(policies[0].html)("li").text()).toContain(pack.shoes.returnConditions.split("\n")[0])
    const client = generatePolicies({ ...values, returnFeePayer: "client", returnAddress: "" }, code)[0].html
    expect(client).toContain(pack.phrases.returnAddressPending)
    expect(client).toContain(pack.phrases.returnLabelClient.replace("{{storeName}}", "Atelier &amp; Lin"))
  })

  it("keeps shared identity and numeric settings while preserving custom text independently per language", () => {
    const overrides = { fr: { productDescription: "les rideaux" }, en: { productDescription: "our curtains", returnConditions: "Custom English clause" } }
    const french = getLocalizedPolicyValues(shared, "fr", overrides)
    const english = getLocalizedPolicyValues({ ...shared, returnDays: "60", email: "new@example.com" }, "en", overrides)
    const german = getLocalizedPolicyValues(shared, "de", overrides)
    expect(french.productDescription).toBe("les rideaux")
    expect(english.productDescription).toBe("our curtains")
    expect(english.returnConditions).toBe("Custom English clause")
    expect(english.returnDays).toBe("60")
    expect(english.email).toBe("new@example.com")
    expect(german.productDescription).toBe(policyLocales.de.generic.productDescription)
    expect(getLocalizedPolicyValues(shared, "fr", overrides).productDescription).toBe("les rideaux")
  })
})
