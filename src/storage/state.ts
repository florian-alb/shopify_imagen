import fs from "node:fs";
import { config } from "../config.js";
import type { ProductState, ShopifyProduct } from "../types.js";

export type StateFile = Record<string, ProductState>;

export function readState(): StateFile {
  if (!fs.existsSync(config.statePath)) return {};
  const raw = fs.readFileSync(config.statePath, "utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw) as StateFile;
}

export function writeState(state: StateFile): void {
  fs.writeFileSync(config.statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export function upsertProductState(product: ShopifyProduct, patch: Partial<ProductState>): ProductState {
  const state = readState();
  const key = String(product.id);
  const defaults: ProductState = {
    productId: key,
    handle: product.handle,
    status: "pending",
    availableFixations: [],
    requestedImageTypes: [],
    generatedImages: {},
    attachedImages: {},
    error: null,
    updatedAt: new Date().toISOString()
  };
  const previous = state[key];

  const next: ProductState = {
    ...defaults,
    status: previous?.status ?? defaults.status,
    availableFixations: previous?.availableFixations ?? defaults.availableFixations,
    requestedImageTypes: previous?.requestedImageTypes ?? defaults.requestedImageTypes,
    generatedImages: previous?.generatedImages ?? defaults.generatedImages,
    attachedImages: previous?.attachedImages ?? defaults.attachedImages,
    error: previous?.error ?? defaults.error,
    ...patch,
    productId: key,
    handle: product.handle,
    updatedAt: new Date().toISOString()
  };

  state[key] = next;
  writeState(state);
  return next;
}
