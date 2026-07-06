import { Send } from "lucide-react";
import { BusyIcon } from "@/components/page";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import type { Doc } from "@/lib/convex";

export function JobPublishApprovedDialog({
  open,
  pushedProducts,
  pushing,
  replaceExisting,
  selectedPushableImages,
  selectedPushProductCount,
  targetProduct,
  onOpenChange,
  onPush,
  onReplaceExistingChange,
}: {
  open: boolean;
  pushedProducts: number;
  pushing: boolean;
  replaceExisting: boolean;
  selectedPushableImages: Doc<"generatedImages">[];
  selectedPushProductCount: number;
  targetProduct: Doc<"products"> | null;
  onOpenChange: (open: boolean) => void;
  onPush: () => void;
  onReplaceExistingChange: (checked: boolean) => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {targetProduct
              ? "Push this product's approved images?"
              : "Push approved images to Shopify?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {targetProduct ? (
              <>
                This will upload {selectedPushableImages.length} approved image
                {selectedPushableImages.length === 1 ? "" : "s"} for{" "}
                {targetProduct.title}. Rejected, unreviewed, and
                already-published images will stay untouched.
              </>
            ) : (
              <>
                This will upload {selectedPushableImages.length} approved image
                {selectedPushableImages.length === 1 ? "" : "s"} across{" "}
                {selectedPushProductCount} product
                {selectedPushProductCount === 1 ? "" : "s"}. Rejected,
                unreviewed, and already-published images will stay untouched.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Label className="flex items-start gap-3 rounded-lg border p-3">
          <Checkbox
            className="mt-0.5"
            checked={replaceExisting}
            disabled={pushing}
            onCheckedChange={(checked) =>
              onReplaceExistingChange(checked === true)
            }
          />
          <span>
            <strong className="block text-sm">
              Replace current Shopify galleries
            </strong>
            <span className="mt-1 block text-xs text-muted-foreground">
              Existing Shopify media will deleted each successful upload.
            </span>
          </span>
        </Label>

        {pushing ? (
          <div>
            <div className="mb-2 flex justify-between text-xs text-muted-foreground">
              <span>Publishing products</span>
              <span>
                {pushedProducts} / {selectedPushProductCount}
              </span>
            </div>
            <Progress
              value={
                selectedPushProductCount
                  ? (pushedProducts / selectedPushProductCount) * 100
                  : 0
              }
            />
          </div>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pushing}>Cancel</AlertDialogCancel>
          <Button
            disabled={pushing || !selectedPushableImages.length}
            onClick={onPush}
          >
            <BusyIcon busy={pushing} />
            {!pushing ? <Send data-icon="inline-start" /> : null}
            Push {selectedPushableImages.length} image
            {selectedPushableImages.length === 1 ? "" : "s"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
