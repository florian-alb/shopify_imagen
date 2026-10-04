import { describe, expect, test } from "vitest";
import type { Doc, Id } from "@/lib/convex";
import { buildPublishProductGroups } from "./publishProductGroups";
import type { VisualGroupsData } from "../types";

const groupId = "red" as Id<"visualGroups">;
const visualData = {
  groups: [{ _id: groupId, label: "Rouge" }],
  family: { members: [{ groupId, title: "Peluche Rouge" }] },
} as unknown as VisualGroupsData;
function image(id: string): Doc<"generatedImages"> {
  return {
    _id: id,
    productId: "product",
    imageType: "Hero",
    visualGroupId: groupId,
    generationTarget: {
      kind: "variant",
      key: `variant:${id}`,
      shopifyVariantId: id,
      productTitle: "Peluche",
      variantTitle: `Rouge / ${id} cm`,
      selectedOptions: [],
    },
  } as unknown as Doc<"generatedImages">;
}
describe("publication selection blocks", () => {
  test("keeps two sizes distinct within a visual group and preserves their labels", () => {
    const groups = buildPublishProductGroups(
      [image("20"), image("40")],
      visualData,
      null,
    );
    expect(groups.map((group) => group.label)).toEqual([
      "Rouge / 20 cm",
      "Rouge / 40 cm",
    ]);
    expect(groups.every((group) => group.requiresVariantImage)).toBe(true);
    expect(groups.map((group) => group.images.length)).toEqual([1, 1]);
  });
  test("historical images retain their shared group and focused selection", () => {
    const historical = { ...image("20"), generationTarget: undefined };
    const other = {
      ...image("40"),
      visualGroupId: "blue" as Id<"visualGroups">,
    };
    const groups = buildPublishProductGroups(
      [historical, other],
      visualData,
      groupId,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      label: "Rouge",
      member: { title: "Peluche Rouge" },
      images: [historical],
    });
  });
});
