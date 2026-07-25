import { useState } from "react";
import { useMasterPromptWorkflow } from "./useMasterPromptWorkflow";
import { usePromptTemplateDraftWorkflow } from "./usePromptTemplateDraftWorkflow";
import { usePromptTemplateReorder } from "./usePromptTemplateReorder";
import { usePromptTemplatesEditor } from "./usePromptTemplatesEditor";

export function usePromptSettingsPage() {
  const editor = usePromptTemplatesEditor();
  const [busy, setBusy] = useState<string | null>(null);
  const reorder = usePromptTemplateReorder({
    prompts: editor.prompts,
    reorderPrompts: editor.reorderPrompts,
  });
  const templates = usePromptTemplateDraftWorkflow({
    busy,
    createPrompt: editor.createPrompt,
    orderedPrompts: reorder.orderedPrompts,
    removeFromLocalOrder: reorder.removeFromLocalOrder,
    removePrompt: editor.removePrompt,
    setBusy,
    setPreset: editor.setPreset,
    updatePrompt: editor.updatePrompt,
  });
  const master = useMasterPromptWorkflow({
    generateModelReferenceUploadUrl: editor.generateModelReferenceUploadUrl,
    masterPrompt: editor.masterPrompt,
    removeModelReference: editor.removeModelReference,
    saveModelReference: editor.saveModelReference,
    setBusy,
    updateMasterPrompt: editor.updateMasterPrompt,
  });

  return {
    busy,
    master,
    masterPrompt: editor.masterPrompt,
    orderedPrompts: reorder.orderedPrompts,
    prompts: editor.prompts,
    reorder,
    templates,
  };
}
