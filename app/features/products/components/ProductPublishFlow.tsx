import type { Doc, Id } from "@/lib/convex";
import type { VisualGroupsData } from "../types";
import { useProductImagePublish } from "../hooks/useProductImagePublish";
import { PublishImagesDialog } from "./PublishImagesDialog";

// Mounted only after the product, groups and prompt order have loaded.
export function ProductPublishFlow({ product, readyImages, groupId, visualGroupsData, primaryImageType, destination, onClose }: {
  product: Doc<"products">;
  readyImages: Doc<"generatedImages">[];
  groupId: Id<"visualGroups"> | null;
  visualGroupsData: VisualGroupsData | null;
  primaryImageType: string | null;
  destination: string;
  onClose: () => void;
}) {
  const publish = useProductImagePublish({ product, readyImages, groupId, onPublished: onClose });
  return <PublishImagesDialog
    open onOpenChange={open => { if (!open && !publish.busy) onClose(); }}
    {...publish} readyImages={readyImages} focusedGroupId={groupId}
    hasVisualGroups={Boolean(visualGroupsData?.config)} visualGroupsData={visualGroupsData}
    primaryVariantImageType={primaryImageType} destination={destination} productTitle={product.title}
    onPush={() => void publish.push()}
  />;
}
