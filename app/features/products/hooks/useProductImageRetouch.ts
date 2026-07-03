import { useAction, useMutation } from "convex/react";
import { toast } from "sonner";
import { useState } from "react";

import type {
  RetouchSaveMode,
  RetouchTarget,
} from "@/components/image-retouch-dialog";
import { errorMessage } from "@/lib/errors";
import { api, type Id } from "@/lib/convex";

export function useProductImageRetouch() {
  const generateRetouchUploadUrl = useMutation(
    api.jobs.generateRetouchUploadUrl,
  );
  const prepareRetouchSource = useAction(api.retouch.prepareRetouchSource);
  const saveRetouchedImage = useAction(api.retouch.saveRetouchedImage);
  const [target, setTarget] = useState<RetouchTarget | null>(null);
  const [saving, setSaving] = useState(false);

  async function saveRetouch(
    target: RetouchTarget,
    blob: Blob,
    mode: RetouchSaveMode,
  ) {
    setSaving(true);
    try {
      const uploadUrl = await generateRetouchUploadUrl({});
      const upload = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": blob.type || "image/png" },
        body: blob,
      });
      if (!upload.ok) {
        throw new Error(`Upload failed with status ${upload.status}.`);
      }

      const payload = (await upload.json()) as { storageId?: string };
      if (!payload.storageId) {
        throw new Error("Upload response did not include storage id.");
      }

      await saveRetouchedImage({
        sourceImageId: target.id,
        storageId: payload.storageId as Id<"_storage">,
        contentType: blob.type || "image/png",
        saveMode: mode,
      });
      setTarget(null);
      toast.success(
        mode === "overwrite"
          ? "Image retouchee enregistree"
          : "Version retouchee enregistree",
        {
          description:
            mode === "overwrite"
              ? "L'image existante est remplacee et repasse en attente de validation."
              : "Elle est ajoutee en attente de validation.",
        },
      );
    } catch (retouchError) {
      toast.error("Retouche non enregistree", {
        description: errorMessage(retouchError),
      });
      throw retouchError;
    } finally {
      setSaving(false);
    }
  }

  return {
    target,
    setTarget,
    saving,
    prepareRetouchSource,
    saveRetouch,
  };
}
