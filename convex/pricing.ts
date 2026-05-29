// Token pricing in USD per 1,000,000 tokens, from the official provider docs:
// - Gemini: https://ai.google.dev/gemini-api/docs/pricing
// - OpenAI: https://platform.openai.com/docs/pricing
// Image generation is billed per token; we compute cost from the real usage
// metadata each API returns rather than from per-image estimates.

const PER_MILLION = 1_000_000;

export type TokenUsage = {
  inputTokens?: number;
  outputTokens?: number;
  // OpenAI splits input into text vs image tokens (different rates).
  inputTextTokens?: number;
  inputImageTokens?: number;
};

export type PricedModel = {
  label: string;
  // Unified input rate (Gemini) or text-input rate (OpenAI).
  inputPerMillion: number;
  outputPerMillion: number;
  // OpenAI image-input rate; falls back to inputPerMillion when absent.
  imageInputPerMillion?: number;
};

// Keyed by a substring matched against the model id.
export const MODEL_PRICING: Array<{ match: string; pricing: PricedModel }> = [
  // Gemini 3 Pro Image ("Nano Banana Pro"): $2 input, $120 image output per 1M.
  { match: "gemini-3-pro-image", pricing: { label: "Gemini 3 Pro Image", inputPerMillion: 2.0, outputPerMillion: 120.0 } },
  // Gemini 3.1 Flash-Lite: $0.25 / $1.50.
  { match: "gemini-3.1-flash-lite", pricing: { label: "Gemini 3.1 Flash-Lite", inputPerMillion: 0.25, outputPerMillion: 1.5 } },
  // Gemini 2.5 Flash-Lite (cheapest vision): $0.10 / $0.40.
  { match: "flash-lite", pricing: { label: "Gemini 2.5 Flash-Lite", inputPerMillion: 0.1, outputPerMillion: 0.4 } },
  // GPT Image 2: text input $5, image input $8, image output $30 per 1M.
  { match: "gpt-image", pricing: { label: "GPT Image", inputPerMillion: 5.0, imageInputPerMillion: 8.0, outputPerMillion: 30.0 } }
];

export function pricingForModel(model: string): PricedModel | null {
  const id = model.toLowerCase();
  return MODEL_PRICING.find((entry) => id.includes(entry.match))?.pricing ?? null;
}

// Returns the cost in USD for a single API call, or 0 when the model/usage is unknown.
export function estimateCostUsd(model: string, usage: TokenUsage): number {
  const pricing = pricingForModel(model);
  if (!pricing) return 0;
  const output = usage.outputTokens ?? 0;
  const totalInput = usage.inputTokens ?? 0;

  if (pricing.imageInputPerMillion != null) {
    // OpenAI: split text vs image input tokens at their respective rates.
    const imageInput = usage.inputImageTokens ?? 0;
    const textInput = usage.inputTextTokens ?? Math.max(0, totalInput - imageInput);
    return (
      (textInput * pricing.inputPerMillion + imageInput * pricing.imageInputPerMillion + output * pricing.outputPerMillion) /
      PER_MILLION
    );
  }

  return (totalInput * pricing.inputPerMillion + output * pricing.outputPerMillion) / PER_MILLION;
}
