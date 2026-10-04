import { v, type Infer } from "convex/values";

export const variantSelectionValidator = v.union(
  v.literal("first"),
  v.literal("all"),
);
export type VariantSelection = Infer<typeof variantSelectionValidator>;
export const generationTargetValidator = v.object({
  key: v.string(),
  kind: v.union(v.literal("product"), v.literal("group"), v.literal("variant")),
  shopifyVariantId: v.union(v.string(), v.null()),
  variantTitle: v.string(),
  selectedOptions: v.array(v.object({ name: v.string(), value: v.string() })),
  productTitle: v.string(),
  assignAllVariants: v.optional(v.boolean()),
});
export type GenerationTarget = Infer<typeof generationTargetValidator>;
export const promptBranchValidator = v.union(
  v.literal("main"),
  v.literal("if_true"),
  v.literal("otherwise"),
);

export function imageTargetKey(image: {
  generationTarget?: GenerationTarget;
  visualGroupId?: string | null;
  productId: string;
}) {
  return (
    image.generationTarget?.key ??
    (image.visualGroupId
      ? `group:${image.visualGroupId}`
      : `product:${image.productId}`)
  );
}

export function imageTaskKey(
  image: Parameters<typeof imageTargetKey>[0] & { imageType: string },
) {
  return JSON.stringify([
    image.productId,
    imageTargetKey(image),
    image.imageType,
  ]);
}
