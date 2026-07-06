import { Link } from "@tanstack/react-router";
import { Check, ExternalLink, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GeneratedImageTile } from "@/features/images/components/GeneratedImageTile";
import { getReviewStatus, isReviewable } from "@/features/images/lib/review";
import type { Doc, Id } from "@/lib/convex";

export function JobProductReviewCard({
  images,
  product,
  publishableCount,
  publishDisabled,
  publishing,
  regeneratingId,
  retrying,
  reviewing,
  shopifyAdminUrl,
  onPreview,
  onPublishApproved,
  onRegenerate,
  onRetouch,
  onRetry,
  onReview,
}: {
  images: Doc<"generatedImages">[];
  product: Doc<"products">;
  publishableCount: number;
  publishDisabled: boolean;
  publishing: boolean;
  regeneratingId: Id<"generatedImages"> | null;
  retrying: boolean;
  reviewing: boolean;
  shopifyAdminUrl: string | null;
  onPreview: (imageId: Id<"generatedImages">) => void;
  onPublishApproved: () => void;
  onRegenerate: (image: Doc<"generatedImages">) => void;
  onRetouch: (image: Doc<"generatedImages">) => void;
  onRetry: (image: Doc<"generatedImages">) => void;
  onReview: (
    imageIds: Id<"generatedImages">[],
    reviewStatus: "approved" | "rejected",
  ) => void;
}) {
  const reviewable = images.filter(isReviewable);
  const approved = reviewable.filter(
    (image) => getReviewStatus(image) === "approved",
  ).length;

  return (
    <Card className="rounded-lg">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle className="truncate text-base">{product.title}</CardTitle>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{product.handle}</span>
            <span>·</span>
            <span>
              {approved} / {reviewable.length} approved
            </span>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/products/$productId" params={{ productId: product._id }}>
              <ExternalLink data-icon="inline-start" />
              Product
            </Link>
          </Button>
          {shopifyAdminUrl ? (
            <Button variant="outline" size="sm" asChild>
              <a href={shopifyAdminUrl} target="_blank" rel="noreferrer">
                <ExternalLink data-icon="inline-start" />
                Shopify
              </a>
            </Button>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            disabled={!reviewable.length || reviewing}
            onClick={() =>
              onReview(
                reviewable.map((image) => image._id),
                "approved",
              )
            }
          >
            <Check data-icon="inline-start" />
            Approve all
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!publishableCount || publishDisabled}
            onClick={onPublishApproved}
          >
            {publishing ? (
              <Loader2 data-icon="inline-start" className="animate-spin" />
            ) : (
              <Send data-icon="inline-start" />
            )}
            Publish {publishableCount || ""}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {images.map((image) => (
            <GeneratedImageTile
              key={image._id}
              image={image}
              reviewing={reviewing}
              retrying={retrying}
              regenerating={regeneratingId === image._id}
              onPreview={() => onPreview(image._id)}
              onReview={(reviewStatus) => onReview([image._id], reviewStatus)}
              onRegenerate={() => onRegenerate(image)}
              onRetouch={() => onRetouch(image)}
              onRetry={() => onRetry(image)}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
