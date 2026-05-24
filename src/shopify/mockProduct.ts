import type { ShopifyProduct } from "../types.js";

export const mockProduct: ShopifyProduct = {
  id: "mock-curtain-001",
  title: "Rideau occultant premium velours bleu nuit",
  handle: "rideau-occultant-premium-velours-bleu-nuit",
  options: [
    {
      name: "Fixation",
      values: ["Oeillets", "Passe-tringle", "Galon fronceur"]
    },
    {
      name: "Taille",
      values: ["140 x 260 cm", "280 x 260 cm"]
    }
  ],
  variants: [
    {
      id: "variant-1",
      title: "140 x 260 cm / Oeillets",
      selectedOptions: [
        { name: "Taille", value: "140 x 260 cm" },
        { name: "Fixation", value: "Oeillets" }
      ]
    },
    {
      id: "variant-2",
      title: "280 x 260 cm / Passe-tringle",
      selectedOptions: [
        { name: "Taille", value: "280 x 260 cm" },
        { name: "Fixation", value: "Passe-tringle" }
      ]
    }
  ],
  tags: ["rideaux", "occultant", "crochets escargot"],
  metafields: [
    {
      namespace: "custom",
      key: "fixation_note",
      value: "Disponible avec galon fronceur."
    }
  ],
  images: [
    {
      id: "image-1",
      url: "https://example.com/supplier-reference.jpg",
      altText: "Supplier reference image"
    }
  ],
  featuredImage: {
    url: "https://example.com/supplier-reference.jpg",
    altText: "Supplier reference image"
  }
};
