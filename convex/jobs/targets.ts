import type { Doc, Id } from "../_generated/dataModel";
import type { GenerationTarget, VariantSelection } from "../generationTargets";
import { optionValue, type SelectedOption } from "../promptConditions";

export type VisualGroupTaskTarget = {
  productId: Id<"products">;
  groupId: Id<"visualGroups">;
  key: string;
  label: string;
  optionValues: SelectedOption[];
  referenceUrls: string[];
  variantIds?: string[];
  separated?: boolean;
  productTitle?: string;
};
type Variant = { id: string; title: string; selectedOptions: SelectedOption[] };
export type ImageTarget = {
  groupId: Id<"visualGroups"> | null;
  key: string | null;
  label: string | null;
  optionValues: SelectedOption[];
  referenceUrls: string[];
  generationTarget: GenerationTarget;
};

function productVariants(product: Doc<"products">): Variant[] {
  return product.variants.flatMap((raw: unknown) => {
    if (
      !raw ||
      typeof raw !== "object" ||
      !("id" in raw) ||
      typeof raw.id !== "string"
    )
      return [];
    const variant = raw as {
      id: string;
      title?: string;
      selectedOptions?: SelectedOption[];
    };
    return [
      {
        id: variant.id,
        title: variant.title ?? "",
        selectedOptions: variant.selectedOptions ?? [],
      },
    ];
  });
}

export function referenceImageUrls(
  product: Doc<"products">,
  variantId?: string,
) {
  const images = product.currentShopifyImages as Array<{
    url?: string;
    variantIds?: string[];
  }>;
  const candidates = [
    ...(variantId
      ? images
          .filter((image) => image.variantIds?.includes(variantId))
          .map((image) => image.url)
      : []),
    product.featuredImageUrl,
    ...images.map((image) => image.url),
  ].filter((url): url is string => typeof url === "string" && url.length > 0);
  return Array.from(new Set(candidates));
}

export function selectImageTargets(args: {
  product: Doc<"products">;
  visualTargets?: VisualGroupTaskTarget[];
  variantSelection?: VariantSelection;
  separated?: boolean;
}): ImageTarget[] {
  const { product } = args;
  const variants = productVariants(product);
  const groups =
    args.visualTargets?.filter((target) => target.productId === product._id) ??
    [];
  function groupMatches(group: VisualGroupTaskTarget, variant: Variant) {
    return group.variantIds
      ? group.variantIds.includes(variant.id)
      : group.optionValues.every(
          (option) =>
            optionValue(variant.selectedOptions, option.name) === option.value,
        );
  }
  function makeTarget(
    variant: Variant | undefined,
    group?: VisualGroupTaskTarget,
    shared = false,
  ): ImageTarget {
    const kind = shared
      ? group
        ? "group"
        : "product"
      : variant
        ? "variant"
        : "product";
    return {
      groupId: group?.groupId ?? null,
      key: group?.key ?? null,
      label: group?.label ?? null,
      optionValues: group?.optionValues ?? [],
      referenceUrls:
        group?.referenceUrls ?? referenceImageUrls(product, variant?.id),
      generationTarget: {
        key:
          kind === "group"
            ? `group:${group!.groupId}`
            : kind === "variant"
              ? `variant:${variant!.id}`
              : `product:${product._id}`,
        kind,
        shopifyVariantId: variant?.id ?? null,
        variantTitle: variant?.title ?? "",
        selectedOptions: variant?.selectedOptions ?? [],
        productTitle: group?.productTitle ?? product.title,
        ...(args.separated && !group ? { assignAllVariants: true } : {}),
      },
    };
  }
  // Omitted selection preserves one task per existing product / visual group.
  if (!args.variantSelection) {
    return groups.length
      ? groups.map((group) =>
          makeTarget(
            variants.find((variant) => groupMatches(group, variant)),
            group,
            true,
          ),
        )
      : [makeTarget(variants[0], undefined, true)];
  }
  if (groups.length && groups.every((group) => group.separated)) {
    return groups.map((group) => {
      const variant = variants.find((candidate) =>
        groupMatches(group, candidate),
      );
      if (!variant)
        throw new Error(
          `Aucune variante Shopify actuelle pour « ${group.label} ».`,
        );
      return makeTarget(variant, group, true);
    });
  }
  if (args.separated) return [makeTarget(variants[0], undefined, true)];
  const eligible = variants.flatMap((variant) => {
    const group = groups.find((candidate) => groupMatches(candidate, variant));
    if (groups.length && !group) return [];
    return [makeTarget(variant, group)];
  });
  if (!eligible.length) {
    if (groups.length)
      throw new Error(
        "Aucune variante Shopify actuelle dans les groupes sélectionnés.",
      );
    return [makeTarget(undefined, undefined, true)];
  }
  return args.variantSelection === "first" ? eligible.slice(0, 1) : eligible;
}
