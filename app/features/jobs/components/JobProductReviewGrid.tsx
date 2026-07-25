import { EmptyState } from "@/components/page";
import type { Doc, Id } from "@/lib/convex";
import type { JobProductRow } from "../lib/jobDetailViewModel";
import { JobProductReviewCard } from "./JobProductReviewCard";

export function JobProductReviewGrid({
  productRows,
  publishing,
  pushTargetProductId,
  regeneratingId,
  retrying,
  reviewing,
  onPreview,
  onPublishApproved,
  onRegenerate,
  onRetouch,
  onRetry,
  onReview,
}: {
  productRows: JobProductRow[];
  publishing: boolean;
  pushTargetProductId: Id<"products"> | null;
  regeneratingId: Id<"generatedImages"> | null;
  retrying: boolean;
  reviewing: boolean;
  onPreview: (imageId: Id<"generatedImages">) => void;
  onPublishApproved: (productId: Id<"products">) => void;
  onRegenerate: (image: Doc<"generatedImages">) => void;
  onRetouch: (image: Doc<"generatedImages">) => void;
  onRetry: (image: Doc<"generatedImages">) => void;
  onReview: (
    imageIds: Id<"generatedImages">[],
    reviewStatus: "approved" | "rejected",
  ) => void;
}) {
  if (!productRows.length) {
    return (
      <EmptyState
        title="No images in this view"
        body="Choose another review filter to see the rest of this batch."
      />
    );
  }

  return (
    <section className="grid gap-4">
      {productRows.map((row) => (
        <JobProductReviewCard
          key={row.product._id}
          product={row.product}
          shopifyAdminUrl={row.shopifyAdminUrl}
          images={row.images}
          reviewing={reviewing}
          retrying={retrying}
          publishing={publishing && pushTargetProductId === row.product._id}
          publishDisabled={publishing}
          publishableCount={row.publishableCount}
          regeneratingId={regeneratingId}
          onPreview={onPreview}
          onReview={onReview}
          onPublishApproved={() => onPublishApproved(row.product._id)}
          onRegenerate={onRegenerate}
          onRetouch={onRetouch}
          onRetry={onRetry}
        />
      ))}
    </section>
  );
}
