import { useState } from "react";
import { toast } from "sonner";
import { type Id } from "@/lib/convex";
import {
  modelReferenceBusyValue,
} from "../lib/promptTemplateDrafts";
import type { usePromptTemplatesEditor } from "./usePromptTemplatesEditor";

type PromptTemplatesEditor = ReturnType<typeof usePromptTemplatesEditor>;

type MasterDraft = {
  key: string;
  value: string;
} | null;

function masterPromptDraftKey(
  masterPrompt: PromptTemplatesEditor["masterPrompt"],
) {
  if (!masterPrompt) return "";
  return `${masterPrompt.shopId ?? ""}:${masterPrompt.updatedAt ?? ""}`;
}

export function useMasterPromptWorkflow({
  generateModelReferenceUploadUrl,
  masterPrompt,
  removeModelReference,
  saveModelReference,
  setBusy,
  updateMasterPrompt,
}: {
  generateModelReferenceUploadUrl: PromptTemplatesEditor["generateModelReferenceUploadUrl"];
  masterPrompt: PromptTemplatesEditor["masterPrompt"];
  removeModelReference: PromptTemplatesEditor["removeModelReference"];
  saveModelReference: PromptTemplatesEditor["saveModelReference"];
  setBusy: (value: string | null) => void;
  updateMasterPrompt: PromptTemplatesEditor["updateMasterPrompt"];
}) {
  const [masterDraft, setMasterDraft] = useState<MasterDraft>(null);
  const draftKey = masterPromptDraftKey(masterPrompt);
  const masterPromptValue =
    masterDraft?.key === draftKey
      ? masterDraft.value
      : masterPrompt?.masterPrompt ?? "";
  const masterPromptDirty = Boolean(
    masterPrompt &&
      masterPromptValue.trim() !== masterPrompt.masterPrompt.trim(),
  );

  function updateMasterDraft(value: string) {
    setMasterDraft({ key: draftKey, value });
  }

  async function saveMaster() {
    const nextMasterPrompt = masterPromptValue.trim();
    setBusy("master");
    try {
      await updateMasterPrompt({
        masterPrompt: nextMasterPrompt,
      });
      setMasterDraft(null);
      toast.success("Master prompt saved");
    } catch (saveError) {
      toast.error("Failed save master prompt", {
        description:
          saveError instanceof Error ? saveError.message : String(saveError),
      });
    } finally {
      setBusy(null);
    }
  }

  async function uploadModelReference(key: string, file: File) {
    if (file.type && !file.type.startsWith("image/")) {
      toast.error("Ajoutez un fichier image.");
      return;
    }

    setBusy(modelReferenceBusyValue(key));
    try {
      const uploadUrl = await generateModelReferenceUploadUrl({});
      const upload = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
        },
        body: file,
      });
      if (!upload.ok) {
        throw new Error(`Upload failed with status ${upload.status}.`);
      }

      const payload = (await upload.json()) as { storageId?: string };
      if (!payload.storageId) {
        throw new Error("Upload response did not include storage id.");
      }

      await saveModelReference({
        key,
        storageId: payload.storageId as Id<"_storage">,
        fileName: file.name,
        ...(file.type ? { contentType: file.type } : {}),
        size: file.size,
      });
      toast.success("Reference mannequin enregistree");
    } catch (uploadError) {
      toast.error("Failed upload model reference", {
        description:
          uploadError instanceof Error
            ? uploadError.message
            : String(uploadError),
      });
    } finally {
      setBusy(null);
    }
  }

  async function deleteModelReference(key: string) {
    setBusy(modelReferenceBusyValue(key));
    try {
      await removeModelReference({ key });
      toast.success("Reference mannequin supprimee");
    } catch (removeError) {
      toast.error("Failed remove model reference", {
        description:
          removeError instanceof Error
            ? removeError.message
            : String(removeError),
      });
    } finally {
      setBusy(null);
    }
  }

  return {
    masterPromptDirty,
    masterPromptValue,
    deleteModelReference,
    saveMaster,
    updateMasterDraft,
    uploadModelReference,
  };
}
