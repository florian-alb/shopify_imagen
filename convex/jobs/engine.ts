import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { shopMatchesScope, type ShopScope } from "../shopScope";

type ImageProvider = "openai" | "gemini";
type ExecutionMode = "realtime" | "batch";

export async function currentGenerationEngine(
  ctx: MutationCtx,
  scope: ShopScope,
) {
  const rows = (await ctx.db.query("appSettings").collect()).filter(
    (row: Doc<"appSettings">) => shopMatchesScope(row, scope),
  );
  const settings = Object.fromEntries(
    rows.map((row: Doc<"appSettings">) => [row.key, row.value]),
  );
  const imageProvider: ImageProvider =
    settings.IMAGE_PROVIDER === "gemini" ? "gemini" : "openai";
  const executionMode: ExecutionMode =
    settings.GENERATION_EXECUTION_MODE === "batch" ? "batch" : "realtime";
  const imageModel =
    imageProvider === "gemini"
      ? String(settings.GEMINI_IMAGE_MODEL ?? "gemini-3-pro-image-preview")
      : String(settings.OPENAI_IMAGE_MODEL ?? "gpt-image-2-2026-04-21");
  const vibeAnalysisDefault = String(settings.VIBE_ANALYSIS ?? "on") !== "off";
  return { imageProvider, executionMode, imageModel, vibeAnalysisDefault };
}
