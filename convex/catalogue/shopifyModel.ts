import { effective, identity } from "./model"
export const uniqueIdentifier = (origin: string, id: string) => ({
  namespace: "imagen_catalog",
  key: "source_id",
  value: identity(origin, id),
})
export function productInput(
  product: ReturnType<typeof effective>,
  origin: string,
  description: string,
) {
  if (
    !product.sourceId ||
    product.jsonStatus !== "complete" ||
    product.htmlStatus !== "complete"
  )
    throw new Error(`Fiche incomplète : ${product.title}`)
  if (product.variants.length > 2048)
    throw new Error(`Trop de variantes : ${product.title}`)
  return {
    title: product.title,
    handle: product.handle,
    descriptionHtml: description,
    status: "DRAFT",
    tags: product.tags,
    vendor: product.vendor,
    productType: product.productType,
    seo: {
      title: product.seo.title || product.title,
      description: product.seo.description,
    },
    productOptions: product.options.map((o, i) => ({
      name: o.name,
      position: i + 1,
      values: o.values.map((name) => ({ name })),
    })),
    variants: product.variants.map((v) => ({
      price: v.price,
      ...(v.compareAtPrice ? { compareAtPrice: v.compareAtPrice } : {}),
      sku: v.sku,
      optionValues: v.options.map((name, i) => ({
        optionName: product.options[i]?.name ?? "Title",
        name,
      })),
      inventoryItem: {
        tracked: false,
        requiresShipping: true,
        measurement: {
          weight: {
            value: v.weight,
            unit:
              (
                {
                  kg: "KILOGRAMS",
                  g: "GRAMS",
                  lb: "POUNDS",
                  oz: "OUNCES",
                } as Record<string, string>
              )[v.weightUnit] ?? "KILOGRAMS",
          },
        },
      },
      ...(v.imageId && product.images.find((img) => img.id === v.imageId)
        ? {
            file: {
              originalSource: product.images.find(
                (img) => img.id === v.imageId,
              )!.url,
            },
          }
        : {}),
    })),
    files: product.images.map((img) => ({
      originalSource: img.url,
      alt: img.alt,
      contentType: "IMAGE",
    })),
    // The definition supplies the type. Keep the custom ID tuple identical
    // in both arguments (Shopify rejects extra fields with METAFIELD_MISMATCH).
    metafields: [uniqueIdentifier(origin, product.sourceId)],
  }
}
