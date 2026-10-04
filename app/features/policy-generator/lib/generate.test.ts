import { describe, expect, it } from "vitest"
import { initialPolicyValues, shoeProductProfile, type PolicyValues } from "../defaults"
import { policyFields } from "../fields"
import { buildPolicyDocument, buildPolicyPreview, generatePolicies, policyTemplates } from "./generate"
import { validatePolicyValues } from "./validation"

const completeValues: PolicyValues = {
  ...initialPolicyValues,
  storeName: "Atelier du Lin", websiteUrl: "https://atelier-du-lin.example",
  operatorName: "Société du Lin", publisherName: "Camille Martin",
  legalStatus: "SAS", siret: "12345678901234", address: "12 rue des Ateliers\n69002 Lyon",
  email: "bonjour@atelier-du-lin.example", phone: "+33 4 12 34 56 78", updatedAt: "2026-10-02",
  productDescription: "les rideaux et accessoires", returnDays: "45", shippingFee: "4.90",
  supportStart: "10:00", supportEnd: "17:30", supportResponseHours: "48",
}

describe("policy generator", () => {
  it("covers every form key and resolves all six templates without the original site or footwear leaking", () => {
    expect(new Set(policyFields.map((field) => field.key))).toEqual(new Set(Object.keys(initialPolicyValues)))
    expect(validatePolicyValues(completeValues)).toEqual({})
    const policies = generatePolicies(completeValues)
    expect(policies).toHaveLength(6)
    for (const policy of policies) {
      expect(policy.html).not.toMatch(/Maison Patine|maison-patine|ALBORA|Nougaro|84252786300018|mocassin|semelle|pointure|\{\{\w+\}\}/)
      expect(policy.html).toContain(completeValues.storeName)
      expect(policy.html).toContain(completeValues.email)
      expect(policy.html).toContain("tel:+33412345678")
      expect(policy.html).toContain(completeValues.publisherName)
    }
    expect(policies[0].html).toContain("45e jour")
    expect(policies[0].html).toContain("14 jours")
    expect(policies[0].html).not.toContain("30 jours")
    expect(policies[1].html).toContain("2 octobre 2026")
    expect(policies[2].html).toContain("4,90")
    expect(policies[2].html).not.toContain("La livraison est offerte")
    expect(policies[3].html).toContain("10h00 et 17h30")
    expect(policies[3].html).toContain("après 17h30")
    expect(policies[3].html).toContain("48 heures ouvrées")
  })

  it("updates fees, free delivery, return address and optional creator identity consistently", () => {
    const policies = generatePolicies({ ...completeValues, shippingFee: "0", returnFeePayer: "boutique", returnAddress: "8 rue des Retours\n75001 Paris", creatorName: "Studio Textile", creatorEmail: "studio@example.com", creatorPhone: "+33 1 22 33 44 55", creatorAddress: "Paris" })
    expect(policies[0].html.match(/pris en charge par Atelier du Lin/g)?.length).toBe(5)
    expect(policies[0].html).toContain("étiquette de retour prépayée")
    expect(policies[0].html).toContain("8 rue des Retours<br>75001 Paris")
    expect(policies[2].html).toContain("La livraison est offerte")
    expect(policies[4].html).toContain("Studio Textile")
    expect(policies[4].html).toContain("mailto:studio@example.com")
    expect(policies[4].html).toContain("tel:+33122334455")
    expect(generatePolicies({ ...completeValues, publisherName: "" })[4].html).toContain("Responsable de la publication :</strong> Société du Lin")
  })

  it("preserves shoe-specific clauses when that profile is chosen", () => {
    const refund = generatePolicies({ ...completeValues, ...shoeProductProfile })[0].html
    expect(refund).toContain("semelles propres et non marquées")
    expect(refund).toContain("une pointure différente")
    expect(refund).toContain("ne pas coller directement l’étiquette de transport sur la boîte de chaussures")
  })

  it("escapes user content in text, lists and attributes without evaluating replacement tokens", () => {
    const policies = generatePolicies({ ...completeValues, storeName: '<img src=x onerror="alert(1)">{{email}}', returnConditions: '<script>alert(1)</script>\nA & B', creatorEmail: 'x" onclick="evil()@example.com', address: '<svg onload="evil()">' })
    const html = policies.map((policy) => policy.html).join("\n")
    expect(html).not.toMatch(/<script|<img|<svg|href="[^"]*" onclick=/)
    expect(html).toContain("&lt;img")
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;")
    expect(html).toContain("<li><p>A &amp; B</p></li>")
    expect(html).toContain("{{email}}")
  })

  it("repairs pasted Markdown links and points internal links at the entered website", () => {
    const html = generatePolicies(completeValues).map((policy) => policy.html).join("\n")
    expect(html).not.toContain('href="[')
    expect(html).toContain('href="https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032226842/"')
    expect(html).toContain('href="https://atelier-du-lin.example/policies/refund-policy"')
    expect(html).toContain('href="https://atelier-du-lin.example/pages/contact"')
    expect(generatePolicies({ ...completeValues, contactPath: "https://support.example.com/contact" })[2].html).toContain('href="https://support.example.com/contact"')
  })

  it("rejects unsafe URLs and incomplete or inconsistent inputs", () => {
    expect(Object.keys(validatePolicyValues(initialPolicyValues)).length).toBeGreaterThan(0)
    const errors = validatePolicyValues({ ...completeValues, websiteUrl: "javascript:alert(1)", contactPath: "//evil.example", refundPath: "/\\evil.example", privacyPath: "data:text/html,x", returnDays: "14", siret: "123", updatedAt: "2026-02-30", shippingFee: "-1", supportEnd: "09:00", trackingHours: "1.5", returnFeePayer: "other", email: 'x"@example.com' })
    for (const key of ["websiteUrl", "contactPath", "refundPath", "privacyPath", "returnDays", "siret", "updatedAt", "shippingFee", "supportEnd", "trackingHours", "returnFeePayer", "email"]) expect(errors).toHaveProperty(key)
    expect(generatePolicies({ ...completeValues, websiteUrl: "javascript:alert(1)", contactPath: "javascript:evil()" })[4].html).not.toContain("javascript:")
  })

  it("exports a standalone six-document HTML bundle and isolates the preview", () => {
    const policies = generatePolicies(completeValues)
    const document = buildPolicyDocument(policies, '<b>Site</b>')
    expect(document).toContain("<!doctype html>")
    expect(document).toContain("&lt;b&gt;Site&lt;/b&gt;")
    for (const policy of policyTemplates) {
      expect(document).toContain(`href="#${policy.id}"`)
      expect(document).toContain(`<article id="${policy.id}">`)
    }
    expect(document).not.toMatch(/<refund_policy>|<privacy>|<terms_of_sale>/)
    expect(buildPolicyPreview(policies[0], completeValues.storeName)).toContain("default-src &#39;none&#39;")
  })
})
