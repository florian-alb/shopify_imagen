// Shared by onboarding, OAuth, and catalog diagnostics. Write scopes include read access.
export const SHOPIFY_IMAGE_SCOPES = ["write_products", "write_files"] as const;

export const REQUIRED_SHOPIFY_ADMIN_SCOPES = [
  ...SHOPIFY_IMAGE_SCOPES,
  "write_online_store_navigation",
] as const;
