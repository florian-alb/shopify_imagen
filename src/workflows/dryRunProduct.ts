import { getAvailableFixations, getRequiredImageTypes } from "../prompts/fixationDetector.js";
import { loadPrompt, renderPrompt } from "../prompts/promptLoader.js";
import { getSupplierImageUrl } from "../shopify/referenceImage.js";
import { getOutputFilename } from "../storage/files.js";
import { upsertProductState } from "../storage/state.js";
import type { ImageType, ShopifyProduct } from "../types.js";

function preview(text: string, maxLength = 700): string {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength).trimEnd()}...`;
}

export interface DryRunResult {
  product: ShopifyProduct;
  availableFixations: string[];
  requiredImageTypes: ImageType[];
  outputFilenames: Record<string, string>;
  renderedPrompts: Record<string, string>;
  supplierImageUrl: string;
}

export function dryRunProduct(product: ShopifyProduct, options: { budget?: boolean } = {}): DryRunResult {
  const availableFixations = getAvailableFixations(product);
  const requiredImageTypes = getRequiredImageTypes(product, options);
  const outputFilenames: Record<string, string> = {};
  const renderedPrompts: Record<string, string> = {};
  const supplierImageUrl = getSupplierImageUrl(product);

  for (const imageType of requiredImageTypes) {
    const template = loadPrompt(imageType);
    outputFilenames[imageType] = getOutputFilename(product, imageType);
    renderedPrompts[imageType] = renderPrompt(template, {
      PRODUCT_TITLE: product.title,
      PRODUCT_HANDLE: product.handle,
      IMAGE_TYPE: imageType,
      FIXATION_TYPE: availableFixations.includes(imageType as never) ? imageType : ""
    });
  }

  upsertProductState(product, {
    status: "pending",
    availableFixations,
    requestedImageTypes: requiredImageTypes,
    generatedImages: {},
    attachedImages: {},
    error: null
  });

  return {
    product,
    availableFixations,
    requiredImageTypes,
    outputFilenames,
    renderedPrompts,
    supplierImageUrl
  };
}

export function printDryRunResult(result: DryRunResult): void {
  console.log(`\nProduct title: ${result.product.title}`);
  console.log(`Product handle: ${result.product.handle}`);
  console.log(`Supplier reference image: ${result.supplierImageUrl}`);
  console.log(`Detected fixations: ${result.availableFixations.length ? result.availableFixations.join(", ") : "(none)"}`);
  console.log(`Required image types: ${result.requiredImageTypes.join(", ")}`);

  console.log("\nOutput filenames:");
  for (const imageType of result.requiredImageTypes) {
    console.log(`- ${imageType}: ${result.outputFilenames[imageType]}`);
  }

  console.log("\nRendered prompt previews:");
  for (const imageType of result.requiredImageTypes) {
    console.log(`\n--- ${imageType} ---`);
    console.log(preview(result.renderedPrompts[imageType]));
  }
}
