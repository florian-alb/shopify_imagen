import { useAction } from "convex/react";
import { toast } from "sonner";
import { useState } from "react";

import { errorMessage } from "@/lib/errors";
import { api, type Doc } from "@/lib/convex";

export function useProductImageDelete() {
  const deleteImage = useAction(api.shopify.deleteImage);
  const [target, setTarget] = useState<Doc<"generatedImages"> | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirmDelete() {
    if (!target) return;
    const label = target.imageType;
    setBusy(true);
    try {
      await deleteImage({ imageId: target._id });
      setTarget(null);
      toast.success(`Deleted ${label} image everywhere`);
    } catch (deleteError) {
      toast.error("Delete failed", {
        description: errorMessage(deleteError),
      });
    } finally {
      setBusy(false);
    }
  }

  function onOpenChange(open: boolean) {
    if (!open) setTarget(null);
  }

  return {
    target,
    setTarget,
    busy,
    confirmDelete,
    onOpenChange,
  };
}
