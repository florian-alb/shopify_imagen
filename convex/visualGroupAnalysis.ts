"use node";

import sharp from "sharp";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action } from "./_generated/server";
import { requireUserId } from "./authz";
import { normalizeReferenceImage } from "./generation/images";
import { env } from "./generation/runtime";
import { uniqueStorageToken, uploadToR2 } from "./generation/storage";
import { geminiUsage } from "./generation/formats";
import { slugify } from "./lib";
import { estimateCostUsd } from "./pricing";

type AnalysisContext = {
  product: Doc<"products">;
  config: Doc<"visualGroupConfigs">;
  groups: Doc<"visualGroups">[];
  references: Doc<"visualGroupReferences">[];
};

type ModelMatch = {
  groupKey: string;
  confidence: number;
  box2d?: number[];
};

type ModelAssignment = {
  referenceId: string;
  matches: ModelMatch[];
};

type PreparedReference = {
  reference: Doc<"visualGroupReferences">;
  bytes: Buffer;
};

const ANALYSIS_BATCH_SIZE = 8;

function parseAssignments(payload: any): ModelAssignment[] {
  const text = (payload?.candidates?.[0]?.content?.parts ?? [])
    .map((part: any) => part?.text)
    .filter(Boolean)
    .join("")
    .trim();
  if (!text) return [];
  const parsed = JSON.parse(text) as { assignments?: unknown };
  if (!Array.isArray(parsed.assignments)) return [];
  return parsed.assignments.filter(
    (assignment): assignment is ModelAssignment =>
      Boolean(
        assignment &&
          typeof assignment === "object" &&
          typeof (assignment as ModelAssignment).referenceId === "string" &&
          Array.isArray((assignment as ModelAssignment).matches),
      ),
  );
}

function normalizedCrop(box2d: number[] | undefined) {
  if (!box2d || box2d.length !== 4) return null;
  const [yMin, xMin, yMax, xMax] = box2d.map((value) =>
    Math.max(0, Math.min(1000, Number(value))),
  );
  if (![yMin, xMin, yMax, xMax].every(Number.isFinite)) return null;
  if (xMax - xMin < 40 || yMax - yMin < 40) return null;
  return {
    x: xMin / 1000,
    y: yMin / 1000,
    width: (xMax - xMin) / 1000,
    height: (yMax - yMin) / 1000,
  };
}

async function cropReference(args: {
  bytes: Buffer;
  crop: { x: number; y: number; width: number; height: number };
  product: Doc<"products">;
  group: Doc<"visualGroups">;
}) {
  const metadata = await sharp(args.bytes).metadata();
  const imageWidth = metadata.width ?? 1024;
  const imageHeight = metadata.height ?? 1024;
  const left = Math.max(0, Math.floor(args.crop.x * imageWidth));
  const top = Math.max(0, Math.floor(args.crop.y * imageHeight));
  const width = Math.max(
    1,
    Math.min(imageWidth - left, Math.ceil(args.crop.width * imageWidth)),
  );
  const height = Math.max(
    1,
    Math.min(imageHeight - top, Math.ceil(args.crop.height * imageHeight)),
  );
  const bytes = await sharp(args.bytes)
    .extract({ left, top, width, height })
    .resize({
      width: 1024,
      height: 1024,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 88 })
    .toBuffer();
  const key = [
    "references",
    slugify(args.product.handle || args.product.title) || "product",
    `${slugify(args.group.label) || "group"}-${uniqueStorageToken()}.webp`,
  ].join("/");
  return uploadToR2({ bytes, key, contentType: "image/webp" });
}

async function analyzeBatch(args: {
  references: PreparedReference[];
  groups: Doc<"visualGroups">[];
  model: string;
}) {
  const apiKey = env("GEMINI_API_KEY");
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is required for low-cost reference classification.",
    );
  }

  const groupLines = args.groups.map(
    (group) =>
      `- ${group.key}: ${group.label} (${group.optionValues
        .map((option) => `${option.name}=${option.value}`)
        .join(", ")})`,
  );
  const instruction = [
    "Classify Shopify product reference images into the known visual groups.",
    "Return one assignment per reference id.",
    "A reference may match multiple groups only when several distinct variants are visibly present in the same image.",
    "For every visible match, return confidence from 0 to 1.",
    "When an image contains multiple groups, return box2d as [y_min, x_min, y_max, x_max] normalized from 0 to 1000 for each product region.",
    "If no group can be identified reliably, return an empty matches array.",
    "Never invent a group key.",
    "",
    "Known groups:",
    ...groupLines,
  ].join("\n");

  const parts: Array<Record<string, unknown>> = [{ text: instruction }];
  for (const prepared of args.references) {
    parts.push({ text: `Reference id: ${prepared.reference._id}` });
    parts.push({
      inline_data: {
        mime_type: "image/jpeg",
        data: prepared.bytes.toString("base64"),
      },
    });
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(args.model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              assignments: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: {
                    referenceId: { type: "STRING" },
                    matches: {
                      type: "ARRAY",
                      items: {
                        type: "OBJECT",
                        properties: {
                          groupKey: { type: "STRING" },
                          confidence: { type: "NUMBER" },
                          box2d: {
                            type: "ARRAY",
                            items: { type: "NUMBER" },
                          },
                        },
                        required: ["groupKey", "confidence"],
                      },
                    },
                  },
                  required: ["referenceId", "matches"],
                },
              },
            },
            required: ["assignments"],
          },
        },
      }),
    },
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      `Reference classification failed (${response.status}): ${
        payload?.error?.message ?? "unknown error"
      }`,
    );
  }
  return {
    assignments: parseAssignments(payload),
    usage: geminiUsage(payload?.usageMetadata),
  };
}

export const analyze = action({
  args: { productId: v.id("products") },
  handler: async (
    ctx,
    args,
  ): Promise<{ analyzed: number; suggested: number; costUsd: number }> => {
    const userId = await requireUserId(ctx);
    const context = (await ctx.runQuery(
      internal.visualGroups.analysisContext,
      {
        productId: args.productId,
        userId,
      },
    )) as AnalysisContext | null;
    if (!context) throw new Error("Configure visual groups first.");

    const settings = (await ctx.runQuery(internal.settings.internalList, {
      shopId: context.product.shopId ?? null,
    })) as Record<string, unknown>;
    const model = String(
      settings.VARIANT_CLASSIFIER_MODEL ??
        settings.VIBE_MODEL ??
        env("VARIANT_CLASSIFIER_MODEL", "gemini-2.5-flash-lite"),
    );
    const sourceReferences = context.references.filter(
      (reference) => !reference.confirmed && !reference.sourceReferenceId,
    );
    if (!sourceReferences.length) {
      await ctx.runMutation(internal.visualGroups.setAnalysisStatus, {
        configId: context.config._id,
        status: "ready",
        model,
        costUsd: context.config.analysisCostUsd ?? 0,
        error: null,
      });
      return { analyzed: 0, suggested: 0, costUsd: 0 };
    }

    await ctx.runMutation(internal.visualGroups.setAnalysisStatus, {
      configId: context.config._id,
      status: "running",
      model,
      error: null,
    });

    try {
      const prepared: PreparedReference[] = [];
      for (const reference of sourceReferences) {
        prepared.push({
          reference,
          bytes: await normalizeReferenceImage(reference.sourceUrl),
        });
      }

      const groupByKey = new Map(
        context.groups.map((group) => [group.key, group]),
      );
      const preparedById = new Map(
        prepared.map((item) => [String(item.reference._id), item]),
      );
      const applied: Array<{
        sourceReferenceId: Id<"visualGroupReferences">;
        groupKey: string | null;
        confidence: number;
        referenceUrl: string;
        crop?: { x: number; y: number; width: number; height: number };
      }> = [];
      let totalCostUsd = 0;

      for (
        let offset = 0;
        offset < prepared.length;
        offset += ANALYSIS_BATCH_SIZE
      ) {
        const batch = prepared.slice(offset, offset + ANALYSIS_BATCH_SIZE);
        const result = await analyzeBatch({
          references: batch,
          groups: context.groups,
          model,
        });
        totalCostUsd += estimateCostUsd(model, result.usage);

        for (const assignment of result.assignments) {
          const source = preparedById.get(assignment.referenceId);
          if (!source) continue;
          const matches = assignment.matches.filter(
            (match) =>
              groupByKey.has(match.groupKey) &&
              Number.isFinite(match.confidence) &&
              match.confidence >= 0.5,
          );
          if (!matches.length) {
            applied.push({
              sourceReferenceId: source.reference._id,
              groupKey: null,
              confidence: 0,
              referenceUrl: source.reference.sourceUrl,
            });
            continue;
          }

          for (const match of matches) {
            const group = groupByKey.get(match.groupKey)!;
            const crop =
              matches.length > 1 ? normalizedCrop(match.box2d) : null;
            const referenceUrl = crop
              ? await cropReference({
                  bytes: source.bytes,
                  crop,
                  product: context.product,
                  group,
                })
              : source.reference.sourceUrl;
            applied.push({
              sourceReferenceId: source.reference._id,
              groupKey: group.key,
              confidence: Math.max(0, Math.min(1, match.confidence)),
              referenceUrl,
              ...(crop ? { crop } : {}),
            });
          }
        }
      }

      const result: { suggested: number } = await ctx.runMutation(
        internal.visualGroups.applyAnalysis,
        {
          configId: context.config._id,
          assignments: applied,
          model,
          costUsd: totalCostUsd,
        },
      );
      return {
        analyzed: sourceReferences.length,
        suggested: result.suggested,
        costUsd: totalCostUsd,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await ctx.runMutation(internal.visualGroups.setAnalysisStatus, {
        configId: context.config._id,
        status: "failed",
        model,
        error: message.slice(0, 1000),
      });
      throw error;
    }
  },
});
