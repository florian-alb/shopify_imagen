export type GenerationStatus = "not_started" | "generating" | "partial" | "ready" | "pushed" | "canceled" | "failed";
export type ProductGenerationState = "not_started" | "generating" | "complete" | "incomplete" | "failed" | "canceled";
export type ProductReviewState = "none" | "needs_review" | "partially_approved" | "approved" | "rejected";
export type ProductPublishState = "not_ready" | "ready_to_push" | "partially_pushed" | "pushed";
export type ProductPrimaryAction = "generate" | "wait" | "review" | "push" | "fix_errors" | "done";

export const generationStatusLabels: Record<GenerationStatus, string> = {
  not_started: "Not started",
  generating: "Generating",
  partial: "Partial",
  ready: "Ready",
  pushed: "Pushed",
  canceled: "Canceled",
  failed: "Failed"
};

export const productGenerationStateLabels: Record<ProductGenerationState, string> = {
  not_started: "Not started",
  generating: "Generating",
  complete: "Generated",
  incomplete: "Incomplete",
  failed: "Failed",
  canceled: "Canceled"
};

export const productReviewStateLabels: Record<ProductReviewState, string> = {
  none: "No review",
  needs_review: "To review",
  partially_approved: "Partially approved",
  approved: "Approved",
  rejected: "Rejected"
};

export const productPublishStateLabels: Record<ProductPublishState, string> = {
  not_ready: "Not ready",
  ready_to_push: "Ready to push",
  partially_pushed: "Partially pushed",
  pushed: "Pushed"
};

export const productPrimaryActionLabels: Record<ProductPrimaryAction, string> = {
  generate: "Needs generation",
  wait: "Generating",
  review: "Needs review",
  push: "Ready to push",
  fix_errors: "Errors",
  done: "Done"
};

export function statusTone(status: GenerationStatus): "default" | "success" | "warning" | "danger" {
  if (status === "ready" || status === "pushed") return "success";
  if (status === "generating" || status === "partial") return "warning";
  if (status === "failed" || status === "canceled") return "danger";
  return "default";
}

export function generationStateTone(status: ProductGenerationState): "neutral" | "success" | "warning" | "danger" {
  if (status === "complete") return "success";
  if (status === "generating" || status === "incomplete") return "warning";
  if (status === "failed" || status === "canceled") return "danger";
  return "neutral";
}

export function reviewStateTone(status: ProductReviewState): "neutral" | "success" | "warning" | "danger" {
  if (status === "approved") return "success";
  if (status === "needs_review" || status === "partially_approved") return "warning";
  if (status === "rejected") return "danger";
  return "neutral";
}

export function publishStateTone(status: ProductPublishState): "neutral" | "success" | "warning" | "danger" {
  if (status === "pushed") return "success";
  if (status === "ready_to_push" || status === "partially_pushed") return "warning";
  return "neutral";
}

export function primaryActionTone(status: ProductPrimaryAction): "neutral" | "success" | "warning" | "danger" {
  if (status === "done") return "success";
  if (status === "review" || status === "push" || status === "wait") return "warning";
  if (status === "fix_errors") return "danger";
  return "neutral";
}

export function shopifyStatusLabel(status?: string | null) {
  if (!status) return "Unknown Shopify status";
  return status.charAt(0) + status.slice(1).toLowerCase();
}
