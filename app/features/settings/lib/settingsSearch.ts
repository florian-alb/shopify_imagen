import type { SettingsTab } from "../types";
export type SettingsSearch = { tab?: SettingsTab; shopify_oauth?: "success" | "error" };
export function validateSettingsSearch(search: Record<string, unknown>): SettingsSearch {
  return {
    tab: typeof search.tab === "string" && ["boutique", "generation", "modeles", "avance"].includes(search.tab) ? search.tab as SettingsTab : undefined,
    shopify_oauth: search.shopify_oauth === "success" || search.shopify_oauth === "error" ? search.shopify_oauth : undefined,
  };
}
