import { describe, expect, it } from "vitest";

import {
  buildVisualGroupDrafts,
  defaultVisualOptionNames,
  inferReferenceAssignment,
} from "./model";

const options = [
  { name: "Couleur", values: ["Bleu", "Rouge", "Blanc"] },
  { name: "Taille", values: ["S", "M"] },
];

const variants = [
  {
    id: "blue-s",
    title: "Bleu / S",
    selectedOptions: [
      { name: "Couleur", value: "Bleu" },
      { name: "Taille", value: "S" },
    ],
  },
  {
    id: "blue-m",
    title: "Bleu / M",
    selectedOptions: [
      { name: "Couleur", value: "Bleu" },
      { name: "Taille", value: "M" },
    ],
  },
  {
    id: "red-s",
    title: "Rouge / S",
    selectedOptions: [
      { name: "Couleur", value: "Rouge" },
      { name: "Taille", value: "S" },
    ],
  },
];

describe("visual group model", () => {
  it("defaults to the color option", () => {
    expect(defaultVisualOptionNames(options)).toEqual(["Couleur"]);
  });

  it("groups commercial variants by visual option", () => {
    const groups = buildVisualGroupDrafts({
      options,
      variants,
      optionNames: ["Couleur"],
    });

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      label: "Bleu",
      swatchCss: "#3d6fc4",
      variantIds: ["blue-s", "blue-m"],
    });
    expect(groups[1]).toMatchObject({
      label: "Rouge",
      swatchCss: "#c83f3a",
      variantIds: ["red-s"],
    });
  });

  it("supports a merchant-defined combination of visual options", () => {
    const groups = buildVisualGroupDrafts({
      options,
      variants,
      optionNames: ["Couleur", "Taille"],
    });

    expect(groups.map((group) => group.label)).toEqual([
      "Bleu · S",
      "Bleu · M",
      "Rouge · S",
    ]);
    expect(groups.map((group) => group.variantIds)).toEqual([
      ["blue-s"],
      ["blue-m"],
      ["red-s"],
    ]);
  });

  it("falls back to the first meaningful Shopify option", () => {
    expect(
      defaultVisualOptionNames([
        { name: "Title", values: ["Default Title"] },
        { name: "Matière", values: ["Cuir", "Toile"] },
      ]),
    ).toEqual(["Matière"]);
  });

  it("uses an existing Shopify variant-media association first", () => {
    const groups = buildVisualGroupDrafts({
      options,
      variants,
      optionNames: ["Couleur"],
    });

    expect(
      inferReferenceAssignment({
        image: { mediaId: "media-1", variantIds: ["red-s"] },
        groups,
      }),
    ).toMatchObject({
      groupKey: groups[1].key,
      source: "shopify",
      confidence: 1,
      confirmed: true,
    });
  });

  it("falls back to alt text matching", () => {
    const groups = buildVisualGroupDrafts({
      options,
      variants,
      optionNames: ["Couleur"],
    });

    expect(
      inferReferenceAssignment({
        image: { altText: "Ceinture rouge portée" },
        groups,
      }),
    ).toMatchObject({
      groupKey: groups[1].key,
      source: "rule",
      confidence: 0.94,
      confirmed: true,
    });
  });
});
