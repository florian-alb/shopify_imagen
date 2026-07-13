import type { Id } from "@/lib/convex";

export const settingFields = [
  "OPENAI_IMAGE_MODEL",
  "OPENAI_IMAGE_SIZE",
  "OPENAI_IMAGE_QUALITY",
  "OPENAI_IMAGE_OUTPUT_FORMAT",
  "OPENAI_IMAGE_REQUESTS_PER_MINUTE",
  "GEMINI_IMAGE_MODEL",
  "GEMINI_IMAGE_SIZE",
  "GEMINI_IMAGE_ASPECT_RATIO",
  "GEMINI_IMAGE_REQUESTS_PER_MINUTE",
  "VIBE_MODEL",
  "GENERATION_CONCURRENCY",
] as const;

export type SettingKey = (typeof settingFields)[number];

export type SettingsMap = Record<string, unknown>;

export type ShopRow = {
  _id: Id<"shops"> | null;
  domain: string;
  storeHandle: string;
  name: string;
  productQuery: string;
  hasClientCredentials: boolean;
  isActive: boolean;
  source: "database" | "environment";
};

export type ShopForm = {
  name: string;
  domain: string;
  clientId: string;
  clientSecret: string;
  productQuery: string;
};

export type ShopifyAuthorizationStatus = {
  shopDomain: string;
  status: "missing" | "requested" | "granted";
  scopes: {
    missing: string[];
    requested: string[];
    granted: string[];
  };
  authorizationUrl: string | null;
  checkedAt: number;
};

export type ShopAuthorizationState =
  | { status: "closed" }
  | { status: "checking"; shop: ShopRow }
  | {
      status: "authorization_required";
      shop: ShopRow;
      authorization: ShopifyAuthorizationStatus;
      safeAuthorizationUrl: string | null;
    }
  | {
      status: "awaiting_approval";
      shop: ShopRow;
      authorization: ShopifyAuthorizationStatus;
      safeAuthorizationUrl: string;
    }
  | {
      status: "granted";
      shop: ShopRow;
      authorization: ShopifyAuthorizationStatus;
    }
  | { status: "error"; shop: ShopRow; message: string };

export type SettingsTab = "boutique" | "generation" | "modeles" | "avance";

export type SettingDefinition = {
  key: SettingKey;
  label: string;
  description: string;
  scope: "openai" | "gemini" | "vibe" | "shared";
};

export type SettingsDrafts = Record<string, string>;
