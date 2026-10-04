import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { VariantSelection } from "../generationTargets";
import { getActiveShopScope, shopMatchesScope } from "../shopScope";
import { promptSettingsForScope, promptsForScope } from "../prompts/repository";
import { sanitizeModelReferences } from "../prompts/access";
import { visualReferencePosition } from "../visualGroups/model";
import { buildImageTasks, type VisualGroupTaskTarget } from "./planning";

export async function prepareImageTasks(
  ctx: QueryCtx | MutationCtx,
  args: {
    products: Doc<"products">[];
    scope: Awaited<ReturnType<typeof getActiveShopScope>>;
    selectedImageTypes: string[];
    visualGroupIds?: Id<"visualGroups">[];
    variantSelection?: VariantSelection;
    regenerationInstructions?: string;
  },
) {
  const [prompts, promptSettings] = await Promise.all([
    promptsForScope(ctx, args.scope),
    promptSettingsForScope(ctx, args.scope),
  ]);
  const visualTargets: VisualGroupTaskTarget[] = [];
  const separatedProductIds: Id<"products">[] = [];
  const requested = args.visualGroupIds ? new Set(args.visualGroupIds) : null;
  const found = new Set<Id<"visualGroups">>();
  for (const product of args.products) {
    const [config, family, member] = await Promise.all([
      ctx.db
        .query("visualGroupConfigs")
        .withIndex("by_product", (q) => q.eq("productId", product._id))
        .unique(),
      ctx.db
        .query("visualProductFamilies")
        .withIndex("by_source_product", (q) =>
          q.eq("sourceProductId", product._id),
        )
        .unique(),
      product.shopId
        ? ctx.db
            .query("visualProductFamilyMembers")
            .withIndex("by_shop_and_shopify_product_id", (q) =>
              q
                .eq("shopId", product.shopId!)
                .eq("shopifyProductId", product.shopifyProductId),
            )
            .unique()
        : null,
    ]);
    if (member) separatedProductIds.push(product._id);
    const familyMembers = family
      ? await ctx.db
          .query("visualProductFamilyMembers")
          .withIndex("by_family", (q) => q.eq("familyId", family._id))
          .take(501)
      : [];
    if (familyMembers.length > 500)
      throw new Error("Famille de produits trop volumineuse.");
    if (!config || (!args.variantSelection && !requested?.size)) continue;
    const groups = await ctx.db
      .query("visualGroups")
      .withIndex("by_config", (q) => q.eq("configId", config._id))
      .take(501);
    if (groups.length > 500)
      throw new Error("Configuration visuelle trop volumineuse.");
    for (const group of groups.sort((a, b) => a.position - b.position)) {
      if (requested && !requested.has(group._id)) continue;
      if (!shopMatchesScope(group, args.scope))
        throw new Error("Groupe visuel d’une autre boutique.");
      found.add(group._id);
      if (
        family &&
        !familyMembers.some((candidate) => candidate.groupId === group._id)
      ) {
        if (requested)
          throw new Error(
            `La déclinaison « ${group.label} » ne correspond pas à un produit déjà séparé.`,
          );
        continue;
      }
      const [variants, references] = await Promise.all([
        ctx.db
          .query("visualGroupVariants")
          .withIndex("by_group", (q) => q.eq("groupId", group._id))
          .take(501),
        ctx.db
          .query("visualGroupReferences")
          .withIndex("by_group", (q) => q.eq("groupId", group._id))
          .take(501),
      ]);
      if (variants.length > 500 || references.length > 500)
        throw new Error("Groupe visuel trop volumineux.");
      const confirmed = references.filter((reference) => reference.confirmed);
      if (!confirmed.length) {
        if (requested)
          throw new Error(`Confirmez une référence pour « ${group.label} ».`);
        continue;
      }
      visualTargets.push({
        productId: product._id,
        groupId: group._id,
        key: group.key,
        label: group.label,
        optionValues: group.optionValues,
        productTitle: familyMembers.find(
          (candidate) => candidate.groupId === group._id,
        )?.title,
        variantIds: variants.map((variant) => variant.shopifyVariantId),
        referenceUrls: confirmed
          .sort(
            (a, b) => visualReferencePosition(a) - visualReferencePosition(b),
          )
          .map((reference) => reference.referenceUrl),
        separated: Boolean(family || member),
      });
    }
    if (
      args.variantSelection &&
      !visualTargets.some((target) => target.productId === product._id)
    ) {
      throw new Error(
        `Aucun groupe sélectionné avec référence confirmée pour « ${product.title} ».`,
      );
    }
  }
  if (requested && found.size !== requested.size)
    throw new Error(
      "Un groupe sélectionné est absent ou appartient à un autre produit.",
    );
  const result = buildImageTasks({
    ...args,
    prompts,
    promptSettings,
    visualTargets,
    separatedProductIds,
    modelReferences: sanitizeModelReferences(promptSettings?.modelReferences),
  });
  return {
    ...result,
    separatedProductCount: args.products.filter(
      (product) =>
        separatedProductIds.includes(product._id) ||
        visualTargets.some(
          (target) => target.productId === product._id && target.separated,
        ),
    ).length,
  };
}
