import { describe, expect, test } from "vitest";
import {
  publicationTargets,
  publicationVariantIds,
  validatePublicationTargets,
} from "../../shopify/publicationTargets";
import type { GenerationTarget } from "../../generationTargets";

function image(id: string, imageType = "Hero") {
  const generationTarget: GenerationTarget = {
    key: `variant:${id}`,
    kind: "variant",
    shopifyVariantId: id,
    variantTitle: id,
    selectedOptions: [],
    productTitle: "Peluche",
  };
  return {
    productId: "product-1",
    imageType,
    generationTarget,
    visualGroupId: "same-color",
  };
}
describe("publishing variant images", () => {
  test("keeps sizes separate even inside the same visual group", () => {
    const targets = validatePublicationTargets(
      [image("20"), image("40")],
      "Hero",
      true,
    );
    expect(targets).toHaveLength(2);
    expect(
      targets.map((target) => publicationVariantIds(target, ["20", "40"])),
    ).toEqual([["20"], ["40"]]);
  });
  test("requires an approved selected prompt-one image for every target", () => {
    expect(() =>
      validatePublicationTargets(
        [image("20"), image("40", "Detail")],
        "Hero",
        true,
      ),
    ).toThrow("40");
    expect(() => validatePublicationTargets([image("20")], null, true)).toThrow(
      "position",
    );
    expect(() =>
      validatePublicationTargets([image("20"), image("20")], "Hero", true),
    ).toThrow("une seule");
    expect(() =>
      validatePublicationTargets([image("20", "Detail")], "Hero", false),
    ).not.toThrow();
  });
  test("rejects removed variants before any media is created", () => {
    const target = publicationTargets([image("removed")])[0];
    expect(() => publicationVariantIds(target, ["20", "40"])).toThrow(
      "n’existe plus",
    );
  });
  test("preserves shared group association and historical product galleries", () => {
    const group = {
      productId: "product-1",
      imageType: "Hero",
      visualGroupId: "red",
    };
    const target = validatePublicationTargets([group], "Hero", true)[0];
    expect(publicationVariantIds(target, ["20", "40"], ["20", "40"])).toEqual([
      "20",
      "40",
    ]);
    expect(
      validatePublicationTargets(
        [{ productId: "product-1", imageType: "Detail" }],
        null,
        true,
      )[0].requiresVariantImage,
    ).toBe(false);
  });
});
