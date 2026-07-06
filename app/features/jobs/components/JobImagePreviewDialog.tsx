import {
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Paintbrush,
  RotateCcw,
  X,
} from "lucide-react";
import { ImageStateBadge } from "@/components/common/ImageStateBadge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Doc } from "@/lib/convex";

export function JobImagePreviewDialog({
  image,
  index,
  regenerating,
  reviewing,
  total,
  onClose,
  onMove,
  onRegenerate,
  onRetouch,
  onReview,
}: {
  image: Doc<"generatedImages"> | null;
  index: number;
  regenerating: boolean;
  reviewing: boolean;
  total: number;
  onClose: () => void;
  onMove: (delta: number) => void;
  onRegenerate: () => void;
  onRetouch: () => void;
  onReview: (reviewStatus: "approved" | "rejected") => void;
}) {
  return (
    <Dialog open={image !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-5xl">
        {image ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {image.imageType}
                <ImageStateBadge image={image} />
              </DialogTitle>
              <DialogDescription>
                Compare the Shopify reference with the generated image before
                approving it.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 md:grid-cols-2">
              <ComparisonImage
                label="Shopify reference"
                url={image.sourceImageUrl}
              />
              <ComparisonImage label="Generated image" url={image.storageUrl} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <Button
                variant="outline"
                size="sm"
                disabled={total < 2}
                onClick={() => onMove(-1)}
              >
                <ChevronLeft data-icon="inline-start" />
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">
                {index + 1} / {total}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={total < 2}
                onClick={() => onMove(1)}
              >
                Next
                <ChevronRight data-icon="inline-end" />
              </Button>
            </div>
            <DialogFooter className="flex-col sm:flex-row">
              <Button
                variant="destructive"
                disabled={reviewing}
                onClick={() => onReview("rejected")}
              >
                <X data-icon="inline-start" />
                Reject
              </Button>
              <Button
                variant="outline"
                disabled={regenerating}
                onClick={onRegenerate}
              >
                {regenerating ? (
                  <Loader2 data-icon="inline-start" className="animate-spin" />
                ) : (
                  <RotateCcw data-icon="inline-start" />
                )}
                Regenerate
              </Button>
              <Button
                variant="outline"
                disabled={!image.storageUrl}
                onClick={onRetouch}
              >
                <Paintbrush data-icon="inline-start" />
                Retoucher
              </Button>
              <Button disabled={reviewing} onClick={() => onReview("approved")}>
                <Check data-icon="inline-start" />
                Approve
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function ComparisonImage({
  label,
  url,
}: {
  label: string;
  url?: string | null;
}) {
  return (
    <figure className="overflow-hidden rounded-lg border bg-muted/50">
      <figcaption className="border-b bg-background px-3 py-2 text-xs font-medium uppercase text-muted-foreground">
        {label}
      </figcaption>
      <div className="grid min-h-64 place-items-center p-2">
        {url ? (
          <img
            src={url}
            alt={label}
            className="max-h-[55vh] w-full rounded-md object-contain"
          />
        ) : (
          <span className="text-sm text-muted-foreground">
            No image available
          </span>
        )}
      </div>
    </figure>
  );
}
