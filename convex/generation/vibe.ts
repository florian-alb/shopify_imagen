"use node";

import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { augmentPrompt } from "../lib";
import { estimateCostUsd, type TokenUsage } from "../pricing";
import { referenceUrlsForImage } from "./batchTypes";
import { geminiUsage } from "./formats";
import { normalizeReferenceImage } from "./images";
import { env } from "./runtime";

// Quick, low-cost vision pass: describe the ideal real-world scene for a product
// so the generation prompt stages it correctly (e.g. a kids room, not a salon).
async function analyzeVibe(args: {
  sourceImageUrl: string;
  model: string;
}): Promise<{ text: string; usage: TokenUsage }> {
  const apiKey = env("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY is required for vibe analysis.");
  const referenceBytes = await normalizeReferenceImage(args.sourceImageUrl);
  const instruction =
    "You are a product photography art director. Look at this product image and describe, in ONE concise sentence, the ideal real-world scene to showcase it: room/setting, target audience, mood, and color palette. Infer the intended end-user context (e.g. a child's bedroom for a kids product, not a generic luxury living room). Reply with the description only, no preamble.";
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(args.model)}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: instruction },
              {
                inline_data: {
                  mime_type: "image/jpeg",
                  data: referenceBytes.toString("base64"),
                },
              },
            ],
          },
        ],
        generationConfig: { temperature: 0.4 },
      }),
    },
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payload = (await response.json().catch(() => null)) as any;
  if (!response.ok) {
    throw new Error(
      `Vibe analysis failed (${response.status}): ${payload?.error?.message ?? "unknown error."}`,
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parts: any[] = payload?.candidates?.[0]?.content?.parts ?? [];
  const text = parts
    .map((part) => part?.text)
    .filter(Boolean)
    .join(" ")
    .trim();
  return { text, usage: geminiUsage(payload?.usageMetadata) };
}

// Ensures a product has a cached vibe, analyzing once when enabled. Returns the
// vibe string (possibly empty). Errors are swallowed so generation still runs.
export async function ensureProductVibe(
  ctx: Pick<ActionCtx, "runMutation">,
  product: Doc<"products">,
  sourceImageUrl: string | null | undefined,
  settings: Record<string, unknown>,
  enabled: boolean,
): Promise<string> {
  if (typeof product.vibe === "string") return product.vibe;
  if (!enabled || !sourceImageUrl) return "";
  const model = String(
    settings.VIBE_MODEL ?? env("VIBE_MODEL", "gemini-2.5-flash-lite"),
  );
  try {
    const { text, usage } = await analyzeVibe({ sourceImageUrl, model });
    const costUsd = estimateCostUsd(model, usage);
    await ctx.runMutation(internal.products.setVibe, {
      productId: product._id,
      vibe: text,
      costUsd,
    });
    return text;
  } catch {
    // Non-fatal: fall back to no scene context rather than failing the job.
    return "";
  }
}

type PromptImage = Doc<"generatedImages">;

export function imageUsesVibe(
  image: { useVibeAnalysis?: boolean },
  job: Doc<"generationJobs">,
  settings: Record<string, unknown>,
) {
  return (
    image.useVibeAnalysis ??
    job.vibeAnalysis ??
    String(settings.VIBE_ANALYSIS ?? "on") !== "off"
  );
}

export function finalPromptForImage(
  image: PromptImage,
  vibe: string | null,
  useVibeAnalysis: boolean,
) {
  return augmentPrompt(image.promptUsed, {
    vibe: useVibeAnalysis ? vibe : null,
    hasSecondReference:
      useVibeAnalysis && referenceUrlsForImage(image).length > 1,
  });
}
