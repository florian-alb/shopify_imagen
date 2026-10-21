import type { effective } from "./model"

// Column names and order from the supplied Shopify product_template.csv.
export const shopifyCsvColumns = [
  "Title", "URL handle", "Description", "Vendor", "Product category", "Type",
  "Tags", "Published on online store", "Status", "SKU", "Variant Barcodes",
  "Option1 name", "Option1 value", "Option1 Linked To",
  "Option2 name", "Option2 value", "Option2 Linked To",
  "Option3 name", "Option3 value", "Option3 Linked To",
  "Price", "Compare-at price", "Cost per item", "Charge tax", "Tax code",
  "Unit price total measure", "Unit price total measure unit",
  "Unit price base measure", "Unit price base measure unit",
  "Inventory tracker", "Inventory quantity", "Continue selling when out of stock",
  "Weight value (grams)", "Weight unit for display", "Requires shipping",
  "Fulfillment service", "Product image URL", "Image position", "Image alt text",
  "Variant image URL", "Gift card", "SEO title", "SEO description",
  "Color (product.metafields.shopify.color-pattern)",
  "Google Shopping / Google product category", "Google Shopping / Gender",
  "Google Shopping / Age group", "Google Shopping / Manufacturer part number (MPN)",
  "Google Shopping / Ad group name", "Google Shopping / Ads labels",
  "Google Shopping / Condition", "Google Shopping / Custom product",
  "Google Shopping / Custom label 0", "Google Shopping / Custom label 1",
  "Google Shopping / Custom label 2", "Google Shopping / Custom label 3",
  "Google Shopping / Custom label 4", "Packed product length", "Packed product width",
  "Packed product height", "Packed product dimension unit",
] as const

type Column = (typeof shopifyCsvColumns)[number]
type Row = Partial<Record<Column, string | number>>

function csvCell(value: string | number = "") {
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}
const csvRow = (row: Row) => shopifyCsvColumns.map((key) => csvCell(row[key])).join(",") + "\r\n"
export const shopifyCsvHeader = shopifyCsvColumns.map(csvCell).join(",") + "\r\n"

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {}
}

/** One complete product group, so file splitting never separates its variants/images. */
export function productCsv(product: ReturnType<typeof effective>, jsonSource?: string): string {
  if (product.excluded || product.jsonStatus !== "complete" || product.htmlStatus !== "complete") return ""
  if (!product.variants.length) return ""
  if (product.options.length > 3)
    throw new Error(`Le CSV Shopify accepte au maximum trois options : ${product.title}`)

  const source = object(jsonSource ? JSON.parse(jsonSource) : null)
  const raw = object(source.product ?? source)
  const variants = new Map((Array.isArray(raw.variants) ? raw.variants : []).map((value) => {
    const variant = object(value)
    return [String(variant.id), variant] as const
  }))
  const images = [...product.images].sort((a, b) => a.position - b.position)
  const rows: string[] = []
  for (let i = 0; i < Math.max(product.variants.length, images.length); i++) {
    const row: Row = { "URL handle": product.handle }
    if (i === 0) Object.assign(row, {
      Title: product.title,
      Description: product.description,
      Vendor: product.vendor,
      Type: product.productType,
      Tags: product.tags.join(", "),
      "Published on online store": "FALSE",
      Status: "draft",
      "Gift card": "FALSE",
      "SEO title": product.seo.title || product.title,
      "SEO description": product.seo.description,
    } satisfies Row)
    const variant = product.variants[i]
    if (variant) {
      const original = variants.get(variant.id) ?? {}
      const factor = { g: 1, kg: 1000, lb: 453.59237, oz: 28.349523125 }[variant.weightUnit]
      Object.assign(row, {
        SKU: variant.sku,
        "Variant Barcodes": typeof original.barcode === "string" ? original.barcode : "",
        Price: variant.price,
        "Compare-at price": variant.compareAtPrice ?? "",
        "Charge tax": original.taxable === false ? "FALSE" : "TRUE",
        "Continue selling when out of stock": original.inventory_policy === "continue" ? "CONTINUE" : "DENY",
        "Weight value (grams)": factor === undefined ? "" : Math.round(variant.weight * factor),
        "Weight unit for display": factor === undefined ? "" : variant.weightUnit,
        "Requires shipping": original.requires_shipping === false ? "FALSE" : "TRUE",
        "Fulfillment service": "manual",
        "Variant image URL": images.find((image) => image.id === variant.imageId)?.url ?? "",
      } satisfies Row)
      for (let option = 0; option < Math.max(1, product.options.length); option++) {
        if (i === 0) row[`Option${option + 1} name` as Column] = product.options[option]?.name ?? "Title"
        row[`Option${option + 1} value` as Column] = variant.options[option] ?? "Default Title"
      }
    }
    const image = images[i]
    if (image) Object.assign(row, {
      "Product image URL": image.url,
      "Image position": i + 1,
      "Image alt text": image.alt,
    } satisfies Row)
    rows.push(csvRow(row))
  }
  return rows.join("")
}
