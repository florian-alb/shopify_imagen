import type { SettingDefinition } from "./types";

export const APP_NAME = "Shopify Image Studio";
export const DEFAULT_PRODUCT_QUERY = "status:active,draft,archived";
export const ADMIN_SCOPES = "read_products,write_products";

export const modelSettings: SettingDefinition[] = [
  {
    key: "OPENAI_IMAGE_MODEL",
    label: "Modele image OpenAI",
    description: "Modele utilise quand le moteur OpenAI est actif.",
    scope: "openai",
  },
  {
    key: "OPENAI_IMAGE_SIZE",
    label: "Taille OpenAI",
    description: "Resolution demandee aux generations OpenAI.",
    scope: "openai",
  },
  {
    key: "OPENAI_IMAGE_QUALITY",
    label: "Qualite OpenAI",
    description: "Niveau de qualite envoye au provider OpenAI.",
    scope: "openai",
  },
  {
    key: "OPENAI_IMAGE_OUTPUT_FORMAT",
    label: "Format OpenAI",
    description: "Format de sortie des images OpenAI.",
    scope: "openai",
  },
  {
    key: "GEMINI_IMAGE_MODEL",
    label: "Modele image Gemini",
    description: "Modele utilise quand le moteur Gemini est actif.",
    scope: "gemini",
  },
  {
    key: "GEMINI_IMAGE_SIZE",
    label: "Taille Gemini",
    description: "Resolution demandee aux generations Gemini.",
    scope: "gemini",
  },
  {
    key: "GEMINI_IMAGE_ASPECT_RATIO",
    label: "Ratio Gemini",
    description: "Ratio transmis aux generations Gemini.",
    scope: "gemini",
  },
  {
    key: "VIBE_MODEL",
    label: "Modele d'analyse visuelle",
    description: "Modele charge de lire l'image Shopify de reference.",
    scope: "vibe",
  },
];

export const advancedSettings: SettingDefinition[] = [
  {
    key: "OPENAI_IMAGE_REQUESTS_PER_MINUTE",
    label: "Limite OpenAI par minute",
    description: "Cadence maximale pour les appels image OpenAI.",
    scope: "openai",
  },
  {
    key: "GEMINI_IMAGE_REQUESTS_PER_MINUTE",
    label: "Limite Gemini par minute",
    description: "Cadence maximale pour les appels image Gemini.",
    scope: "gemini",
  },
  {
    key: "GENERATION_CONCURRENCY",
    label: "Concurrence generation",
    description: "Nombre de generations executees en parallele.",
    scope: "shared",
  },
];
