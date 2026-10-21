// @vitest-environment node
import { readFileSync } from "node:fs"
import { Readable } from "node:stream"
import ExcelJS from "exceljs"
import { describe, expect, test } from "vitest"
import { effective, emptyStructure, type CatalogProduct } from "./model"
import { productCsv, shopifyCsvColumns, shopifyCsvHeader } from "./csv"

function product() {
  const data: CatalogProduct = {
    key: "robe", sourceId: "1", handle: "robe-ete", url: "https://source.example/products/robe-ete",
    title: 'Robe "Été", bleue', description: '<p>Été, "coton"</p>\n<p>Doux</p>',
    vendor: "Atelier", productType: "Robe", sourceTags: ["ignored"],
    options: [{ name: "Taille", values: ["S", "M"] }, { name: "Couleur", values: ["Bleu"] }],
    variants: [
      { id: "11", title: "S / Bleu", sku: "0001", price: "19.99", compareAtPrice: "24.99", currency: "EUR", options: ["S", "Bleu"], weight: 1.25, weightUnit: "kg", imageId: "2" },
      { id: "12", title: "M / Bleu", sku: "0002", price: "21.99", compareAtPrice: null, currency: "EUR", options: ["M", "Bleu"], weight: 150, weightUnit: "g", imageId: null },
    ],
    images: [3, 1, 2].map((n) => ({ id: String(n), url: `https://cdn.example/${n}.jpg`, alt: `Vue ${n}, "été"`, position: n })),
    sections: [], seo: { title: "SEO été", description: "Une robe légère", canonical: "" },
    collections: [], jsonStatus: "complete", htmlStatus: "complete", errors: [], warnings: [], fetchedAt: 0,
  }
  return { ...effective(data, emptyStructure()), tags: ["été", "bleu"] }
}
async function parse(csv: string) {
  const sheet = await new ExcelJS.Workbook().csv.read(Readable.from([shopifyCsvHeader + csv]), { map: (value) => value })
  return Array.from({ length: sheet.rowCount - 1 }, (_, i) => Object.fromEntries(
    shopifyCsvColumns.map((key, column) => [key, sheet.getRow(i + 2).getCell(column + 1).value ?? ""]),
  ))
}

describe("Shopify CSV", () => {
  test("keeps the exact 61 columns from the supplied template", () => {
    const supplied = readFileSync(new URL("./fixtures/shopify-product-template-header.csv", import.meta.url), "utf8").trim()
    expect(shopifyCsvColumns).toHaveLength(61)
    expect(shopifyCsvHeader.trim()).toBe(supplied)
  })
  test("round-trips HTML, accents, quotes, line breaks, variants and extra images", async () => {
    const p = product()
    const rows = await parse(productCsv(p, JSON.stringify({ product: { variants: [
      { id: 12, barcode: "0000123456789", taxable: false, requires_shipping: false, inventory_policy: "continue" },
      { id: 11, barcode: "0000987654321" },
    ] } })))
    expect(rows).toHaveLength(3)
    expect(rows[0]).toMatchObject({
      Title: p.title, Description: p.description, Tags: "été, bleu", Status: "draft",
      "Published on online store": "FALSE", SKU: "0001", "Variant Barcodes": "0000987654321",
      "Option1 name": "Taille", "Option1 value": "S", "Option2 name": "Couleur", "Option2 value": "Bleu",
      "Weight value (grams)": "1250", "Weight unit for display": "kg",
      "Product image URL": "https://cdn.example/1.jpg", "Image position": "1",
      "Variant image URL": "https://cdn.example/2.jpg", "Image alt text": 'Vue 1, "été"',
      "SEO title": "SEO été", "SEO description": "Une robe légère",
      "Product category": "", "Inventory tracker": "", "Inventory quantity": "", "Cost per item": "",
    })
    expect(rows[1]).toMatchObject({
      Title: "", "URL handle": "robe-ete", SKU: "0002", "Option1 name": "", "Option1 value": "M",
      "Charge tax": "FALSE", "Requires shipping": "FALSE", "Continue selling when out of stock": "CONTINUE",
      "Compare-at price": "", "Weight value (grams)": "150",
    })
    expect(rows[2]).toMatchObject({ "URL handle": "robe-ete", SKU: "", Price: "", "Option1 value": "", "Product image URL": "https://cdn.example/3.jpg", "Image position": "3" })
  })
  test.each([["kg", 1.25, "1250"], ["g", 150, "150"], ["lb", 4, "1814"], ["oz", 8, "227"]])("converts %s to whole grams", async (unit, weight, grams) => {
    const p = product()
    p.variants[0] = { ...p.variants[0], weight: Number(weight), weightUnit: String(unit) }
    expect((await parse(productCsv(p)))[0]["Weight value (grams)"]).toBe(grams)
  })
  test("supports a default variant and omits excluded or incomplete products", async () => {
    const p = product()
    p.options = []
    p.variants = [{ ...p.variants[0], options: [] }]
    expect((await parse(productCsv(p)))[0]).toMatchObject({ "Option1 name": "Title", "Option1 value": "Default Title" })
    expect(productCsv({ ...p, excluded: true })).toBe("")
    expect(productCsv({ ...p, htmlStatus: "failed" })).toBe("")
    expect(productCsv({ ...p, jsonStatus: "failed" })).toBe("")
    expect(productCsv({ ...p, variants: [] })).toBe("")
  })
})
