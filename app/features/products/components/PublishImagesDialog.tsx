import type { Dispatch, SetStateAction } from "react";

import { ImageStateBadge } from "@/components/common/ImageStateBadge";
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
import type { Doc, Id } from "@/lib/convex";

export function PublishImagesDialog({
  open,
  onOpenChange,
  readyImages,
  selectedPushIds,
  setSelectedPushIds,
  replaceExisting,
  setReplaceExisting,
  busy,
  onPush,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  readyImages: Doc<"generatedImages">[];
  selectedPushIds: Set<Id<"generatedImages">>;
  setSelectedPushIds: Dispatch<SetStateAction<Set<Id<"generatedImages">>>>;
  replaceExisting: boolean;
  setReplaceExisting: Dispatch<SetStateAction<boolean>>;
  busy: boolean;
  onPush: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Push generated images to Shopify?</AlertDialogTitle>
          <AlertDialogDescription>
            Choose which approved images to upload. Rejected and unreviewed
            images stay untouched.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">
            {selectedPushIds.size} of {readyImages.length} selected
          </span>
          <Label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={
                readyImages.length > 0 &&
                selectedPushIds.size === readyImages.length
              }
              onCheckedChange={(checked) =>
                setSelectedPushIds(
                  checked === true
                    ? new Set(readyImages.map((image) => image._id))
                    : new Set(),
                )
              }
            />
            Select all
          </Label>
        </div>
        <div className="grid max-h-72 gap-2 overflow-y-auto">
          {readyImages.map((image) => (
            <Label
              key={image._id}
              className="flex items-center gap-3 rounded-lg border p-2 has-[:checked]:border-primary"
            >
              <Checkbox
                checked={selectedPushIds.has(image._id)}
                onCheckedChange={(checked) =>
                  setSelectedPushIds((current) => {
                    const next = new Set(current);
                    if (checked === true) next.add(image._id);
                    else next.delete(image._id);
                    return next;
                  })
                }
              />
              <div className="block size-12 shrink-0 overflow-hidden rounded-md bg-muted ring-1 ring-border [&>img]:size-full [&>img]:object-cover">
                <img src={image.storageUrl!} alt={image.imageType} />
              </div>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {image.imageType}
              </span>
              <ImageStateBadge image={image} />
            </Label>
          ))}
        </div>
        <Label className="flex items-start gap-3 rounded-lg border p-3">
          <Checkbox
            className="mt-0.5"
            checked={replaceExisting}
            onCheckedChange={(checked) => setReplaceExisting(checked === true)}
          />
          <span>Replace current Shopify gallery after upload</span>
        </Label>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <Button disabled={busy || !selectedPushIds.size} onClick={onPush}>
            <BusyIcon busy={busy} />
            Push {selectedPushIds.size} image
            {selectedPushIds.size === 1 ? "" : "s"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
