export type GenerationStatus = "not_started" | "generating" | "partial" | "ready" | "pushed" | "canceled" | "failed";
export type ProductGenerationState = "not_started" | "generating" | "complete" | "incomplete" | "failed" | "canceled";
export type ProductReviewState = "none" | "needs_review" | "partially_approved" | "approved" | "rejected";
export type ProductPublishState = "not_ready" | "ready_to_push" | "partially_pushed" | "pushed";
export type ProductPrimaryAction = "generate" | "wait" | "review" | "push" | "fix_errors" | "done";

export const generationStatusLabels: Record<GenerationStatus, string> = {
  not_started: "À générer",
  generating: "En cours",
  partial: "Partiel",
  ready: "Prêt",
  pushed: "Publié",
  canceled: "Annulé",
  failed: "Échec"
};

export const productGenerationStateLabels: Record<ProductGenerationState, string> = {
  not_started: "À générer",
  generating: "En cours",
  complete: "Généré",
  incomplete: "Incomplet",
  failed: "Échec",
  canceled: "Annulé"
};

export const productReviewStateLabels: Record<ProductReviewState, string> = {
  none: "Sans vérification",
  needs_review: "À vérifier",
  partially_approved: "Partiellement approuvé",
  approved: "Approuvé",
  rejected: "Refusé"
};

export const productPublishStateLabels: Record<ProductPublishState, string> = {
  not_ready: "Non prêt",
  ready_to_push: "Prêt à publier",
  partially_pushed: "Partiellement publié",
  pushed: "Publié"
};

export const productPrimaryActionLabels: Record<ProductPrimaryAction, string> = {
  generate: "À générer",
  wait: "En cours",
  review: "À vérifier",
  push: "Prêt à publier",
  fix_errors: "À reprendre",
  done: "Publié"
};

export function statusTone(status: GenerationStatus): "default" | "success" | "warning" | "danger" {
  if (status === "ready" || status === "pushed") return "success";
  if (status === "generating" || status === "partial") return "warning";
  if (status === "failed") return "danger";
  return "default";
}

export function generationStateTone(status: ProductGenerationState): "neutral" | "success" | "warning" | "danger" | "info" {
  if (status === "complete") return "success";
  if (status === "generating") return "info";
  if (status === "incomplete") return "warning";
  if (status === "failed") return "danger";
  return "neutral";
}

export function reviewStateTone(status: ProductReviewState): "neutral" | "success" | "warning" | "danger" | "info" {
  if (status === "approved") return "success";
  if (status === "needs_review" || status === "partially_approved") return "warning";
  if (status === "rejected") return "danger";
  return "neutral";
}

export function publishStateTone(status: ProductPublishState): "neutral" | "success" | "warning" | "danger" | "info" {
  if (status === "pushed") return "success";
  if (status === "ready_to_push") return "info";
  if (status === "partially_pushed") return "warning";
  return "neutral";
}

export function primaryActionTone(status: ProductPrimaryAction): "neutral" | "success" | "warning" | "danger" | "info" {
  if (status === "done") return "success";
  if (status === "wait" || status === "push") return "info";
  if (status === "review") return "warning";
  if (status === "fix_errors") return "danger";
  return "neutral";
}

export function shopifyStatusLabel(status?: string | null) {
  if (!status) return "Statut Shopify inconnu";
  const labels: Record<string, string> = { ACTIVE: "Actif", DRAFT: "Brouillon", ARCHIVED: "Archivé" };
  return labels[status.toUpperCase()] ?? status.charAt(0) + status.slice(1).toLowerCase();
}
