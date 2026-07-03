import { useMutation, useQuery } from "convex/react";
import { api, type Doc } from "@/lib/convex";

export type MasterPromptSettings = {
  shopId: string | null;
  masterPrompt: string;
  modelReferences: Record<
    string,
    {
      storageId: string;
      fileName?: string;
      contentType?: string;
      size?: number;
      updatedAt: number;
      url: string | null;
    }
  >;
  updatedAt: number | null;
} | null;

export function usePromptTemplatesEditor() {
  const prompts = useQuery(api.prompts.list) as Doc<"promptTemplates">[] | undefined;
  const masterPrompt = useQuery(api.prompts.master) as MasterPromptSettings | undefined;
  const createPrompt = useMutation(api.prompts.create);
  const updatePrompt = useMutation(api.prompts.update);
  const updateMasterPrompt = useMutation(api.prompts.updateMaster);
  const generateModelReferenceUploadUrl = useMutation(api.prompts.generateModelReferenceUploadUrl);
  const saveModelReference = useMutation(api.prompts.saveModelReference);
  const removeModelReference = useMutation(api.prompts.removeModelReference);
  const reorderPrompts = useMutation(api.prompts.reorder);
  const removePrompt = useMutation(api.prompts.remove);
  const setPreset = useMutation(api.prompts.setPreset);

  return {
    prompts,
    masterPrompt,
    createPrompt,
    updatePrompt,
    updateMasterPrompt,
    generateModelReferenceUploadUrl,
    saveModelReference,
    removeModelReference,
    reorderPrompts,
    removePrompt,
    setPreset,
  };
}
