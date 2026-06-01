export type GenerationStatus = "not_started" | "generating" | "partial" | "ready" | "pushed" | "failed";

export const generationStatusLabels: Record<GenerationStatus, string> = {
  not_started: "Not started",
  generating: "Generating",
  partial: "Partial",
  ready: "Ready",
  pushed: "Pushed",
  failed: "Failed"
};

export function statusTone(status: GenerationStatus): "default" | "success" | "warning" | "danger" {
  if (status === "ready" || status === "pushed") return "success";
  if (status === "generating" || status === "partial") return "warning";
  if (status === "failed") return "danger";
  return "default";
}

export function shopifyStatusLabel(status?: string | null) {
  if (!status) return "Unknown Shopify status";
  return status.charAt(0) + status.slice(1).toLowerCase();
}
