import {
  Check,
  Eye,
  Loader2,
  Paintbrush,
  RefreshCw,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";

import { ImageStateBadge } from "@/components/common/ImageStateBadge";
import { StateBadge } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getReviewStatus, isReviewable } from "@/features/images/lib/review";
import type { Doc } from "@/lib/convex";

type ReviewStatus = "approved" | "rejected";
type ActionPlacement = "inline" | "overlay";

export function GeneratedImageTile({
  image,
  reviewing = false,
  retrying = false,
  regenerating = false,
  retouchPlacement = "inline",
  deletePlacement = "inline",
  onPreview,
  onReview,
  onRegenerate,
  onRetouch,
  onDelete,
  onRetry,
}: {
  image: Doc<"generatedImages">;
  reviewing?: boolean;
  retrying?: boolean;
  regenerating?: boolean;
  retouchPlacement?: ActionPlacement;
  deletePlacement?: ActionPlacement;
  onPreview?: () => void;
  onReview?: (reviewStatus: ReviewStatus) => void;
  onRegenerate?: () => void;
  onRetouch?: () => void;
  onDelete?: () => void;
  onRetry?: () => void;
}) {
  const retryActive = Boolean(image.activeRetryImageId);
  const busy = retrying || regenerating || retryActive;
  const displayStatus = retryActive ? "regenerating" : image.status;
  const retryError =
    !retryActive && image.retryError && image.retryError !== image.error
      ? image.retryError
      : null;
  const reviewable = isReviewable(image);
  const showReviewActions = reviewable && Boolean(onReview);
  const showRegenerateAction = reviewable && Boolean(onRegenerate);
  const showInlineRetouchAction =
    reviewable && retouchPlacement === "inline" && Boolean(onRetouch);
  const showInlineDeleteAction =
    deletePlacement === "inline" && Boolean(onDelete);
  const inlineActionCount =
    (showReviewActions ? 2 : 0) +
    (showRegenerateAction ? 1 : 0) +
    (showInlineRetouchAction ? 1 : 0) +
    (showInlineDeleteAction ? 1 : 0);

  return (
    <article className="group relative overflow-hidden rounded-lg border bg-background">
      <button
        type="button"
        className="group relative block aspect-square w-full cursor-zoom-in overflow-hidden rounded-none bg-muted [&>img]:size-full [&>img]:object-cover"
        disabled={!image.storageUrl || !onPreview}
        onClick={onPreview}
      >
        {image.storageUrl ? (
          <>
            <img src={image.storageUrl} alt={image.imageType} />
            {onPreview ? (
              <span className="absolute top-2 right-2 rounded-full bg-black/55 p-1.5 text-white opacity-0 transition group-hover:opacity-100">
                <Eye className="size-3.5" />
              </span>
            ) : null}
          </>
        ) : (
          <span className="grid size-full place-items-center text-xs text-muted-foreground">
            {displayStatus}
          </span>
        )}
      </button>
      {retryActive ? (
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-background/60 backdrop-blur-[1px]">
          <div className="inline-flex items-center gap-2 rounded-full border bg-background/90 px-2.5 py-1 text-xs text-muted-foreground shadow-sm">
            <Loader2 className="size-3.5 animate-spin" />
            Regenerating
          </div>
        </div>
      ) : null}
      {retouchPlacement === "overlay" && onRetouch ? (
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={`Retoucher ${image.imageType}`}
          title="Retoucher"
          disabled={!image.storageUrl}
          onClick={onRetouch}
          className="absolute top-1.5 right-10 bg-background/80 opacity-0 backdrop-blur-sm transition group-hover:opacity-100 focus-visible:opacity-100"
        >
          <Paintbrush />
        </Button>
      ) : null}
      {deletePlacement === "overlay" && onDelete ? (
        <Button
          variant="destructive"
          size="icon-sm"
          aria-label="Delete image"
          onClick={onDelete}
          className="absolute top-1.5 right-1.5 bg-background/80 opacity-0 backdrop-blur-sm transition group-hover:opacity-100 focus-visible:opacity-100"
        >
          <Trash2 />
        </Button>
      ) : null}
      <div className="grid gap-2 p-2">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <p className="truncate text-sm font-medium">{image.imageType}</p>
          <ImageStateBadge image={image} />
        </div>
        {image.retouchSourceImageId ? (
          <Badge variant="outline" className="w-fit text-[0.65rem]">
            Retouche
          </Badge>
        ) : null}
        {image.error && !retryActive ? (
          <p className="line-clamp-2 text-xs text-destructive">{image.error}</p>
        ) : null}
        {retryError ? (
          <p className="line-clamp-2 text-xs text-destructive">
            Retry failed: {retryError}
          </p>
        ) : null}
        {image.status === "failed" && onRetry ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label={`Retry ${image.imageType}`}
                variant="outline"
                size="icon-sm"
                disabled={busy}
                onClick={onRetry}
              >
                {busy ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <RefreshCw />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>retry</TooltipContent>
          </Tooltip>
        ) : null}
        {inlineActionCount ? (
          <div
            className="grid gap-1"
            style={{
              gridTemplateColumns: `repeat(${inlineActionCount}, minmax(0, 1fr))`,
            }}
          >
            {showReviewActions && onReview ? (
              <>
                <Button
                  aria-label={`Approve ${image.imageType}`}
                  title="Approve"
                  variant={
                    getReviewStatus(image) === "approved"
                      ? "default"
                      : "outline"
                  }
                  size="icon-sm"
                  disabled={reviewing}
                  onClick={() => onReview("approved")}
                >
                  <Check />
                </Button>
                <Button
                  aria-label={`Reject ${image.imageType}`}
                  title="Reject"
                  variant={
                    getReviewStatus(image) === "rejected"
                      ? "destructive"
                      : "outline"
                  }
                  size="icon-sm"
                  disabled={reviewing}
                  onClick={() => onReview("rejected")}
                >
                  <X />
                </Button>
              </>
            ) : null}
            {showRegenerateAction && onRegenerate ? (
              <Button
                aria-label={`Regenerate ${image.imageType}`}
                title="Regenerate"
                variant="outline"
                size="icon-sm"
                disabled={regenerating}
                onClick={onRegenerate}
              >
                {regenerating ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <RotateCcw />
                )}
              </Button>
            ) : null}
            {showInlineRetouchAction && onRetouch ? (
              <Button
                aria-label={`Retoucher ${image.imageType}`}
                title="Retoucher"
                variant="outline"
                size="icon-sm"
                disabled={!image.storageUrl}
                onClick={onRetouch}
              >
                <Paintbrush />
              </Button>
            ) : null}
            {showInlineDeleteAction && onDelete ? (
              <Button
                aria-label={`Delete ${image.imageType}`}
                title="Delete"
                variant="destructive"
                size="icon-sm"
                onClick={onDelete}
              >
                <Trash2 />
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function PendingGeneratedImageTile({
  caption,
  statusLabel,
}: {
  caption?: string;
  statusLabel: string;
}) {
  return (
    <figure className="relative overflow-hidden rounded-lg bg-muted/30 ring-1 ring-border">
      <div className="relative aspect-square w-full overflow-hidden rounded-none bg-[radial-gradient(circle_at_32%_18%,color-mix(in_oklch,var(--primary)_16%,transparent),transparent_34%),linear-gradient(135deg,color-mix(in_oklch,var(--muted)_88%,var(--background)_12%),color-mix(in_oklch,var(--primary)_10%,var(--background)_90%))]">
        <div className="absolute inset-x-[-18%] bottom-[-36%] h-[38%] animate-pulse rounded-full bg-primary/20 blur-[18px]" />
        <div className="absolute inset-x-[-18%] bottom-[-36%] h-[38%] animate-pulse rounded-full bg-primary/15 blur-[18px] [animation-delay:200ms]" />
        <div className="absolute inset-x-[-18%] bottom-[-36%] h-[38%] animate-pulse rounded-full bg-primary/10 blur-[18px] [animation-delay:400ms]" />
      </div>
      <figcaption className="grid gap-1.5 px-2 py-2">
        {caption ? (
          <span className="truncate text-xs font-medium" title={caption}>
            {caption}
          </span>
        ) : null}
        <div className="min-w-0">
          <StateBadge state="warning">{statusLabel}</StateBadge>
        </div>
      </figcaption>
    </figure>
  );
}
