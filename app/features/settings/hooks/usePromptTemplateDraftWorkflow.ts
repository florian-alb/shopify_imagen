import { useState } from "react";
import { toast } from "sonner";
import { type Doc, type Id } from "@/lib/convex";
import {
  backgroundDraftsEqual,
  defaultAiDraftForPromptName,
  defaultBackgroundDraft,
  defaultPromptAiDraft,
  newPromptTabValue,
  promptAiDraft,
  promptAiDraftsEqual,
  promptBackgroundDraft,
  type BackgroundDraft,
  type NewPromptDraft,
  type PromptAiDraft,
} from "../lib/promptTemplateDrafts";
import type { usePromptTemplatesEditor } from "./usePromptTemplatesEditor";

type PromptTemplatesEditor = ReturnType<typeof usePromptTemplatesEditor>;

export type PromptTemplateEditorState = {
  aiValue: PromptAiDraft;
  backgroundValue: BackgroundDraft;
  canSaveChanges: boolean;
  contentValue: string;
  hasChanges: boolean;
  imageTypeValue: string;
  promptKindValue: string;
};

function deleteDraftValue<T>(current: Record<string, T>, promptId: string) {
  const next = { ...current };
  delete next[promptId];
  return next;
}

export function usePromptTemplateDraftWorkflow({
  busy,
  createPrompt,
  orderedPrompts,
  removeFromLocalOrder,
  removePrompt,
  setBusy,
  setPreset,
  updatePrompt,
}: {
  busy: string | null;
  createPrompt: PromptTemplatesEditor["createPrompt"];
  orderedPrompts: Doc<"promptTemplates">[] | undefined;
  removeFromLocalOrder: (promptId: Id<"promptTemplates">) => void;
  removePrompt: PromptTemplatesEditor["removePrompt"];
  setBusy: (value: string | null) => void;
  setPreset: PromptTemplatesEditor["setPreset"];
  updatePrompt: PromptTemplatesEditor["updatePrompt"];
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [imageTypeDrafts, setImageTypeDrafts] = useState<
    Record<string, string>
  >({});
  const [backgroundDrafts, setBackgroundDrafts] = useState<
    Record<string, BackgroundDraft>
  >({});
  const [aiDrafts, setAiDrafts] = useState<Record<string, PromptAiDraft>>({});
  const [promptKindDrafts, setPromptKindDrafts] = useState<
    Record<string, string>
  >({});
  const [activeTab, setActiveTab] = useState<string | undefined>(undefined);
  const [newPromptDraft, setNewPromptDraft] = useState<NewPromptDraft | null>(
    null,
  );
  const [newPromptAiTouched, setNewPromptAiTouched] = useState(false);
  const [editingPromptNameId, setEditingPromptNameId] =
    useState<Id<"promptTemplates"> | null>(null);
  const [deletePromptId, setDeletePromptId] =
    useState<Id<"promptTemplates"> | null>(null);

  const currentTab =
    activeTab ??
    (newPromptDraft ? newPromptTabValue : orderedPrompts?.[0]?.imageType);
  const canCreatePrompt = Boolean(
    newPromptDraft?.imageType.trim() &&
      newPromptDraft.content.trim() &&
      busy !== "create",
  );
  const deleteTarget =
    orderedPrompts?.find((prompt) => prompt._id === deletePromptId) ?? null;

  function getPromptEditorState(
    prompt: Doc<"promptTemplates">,
  ): PromptTemplateEditorState {
    const imageTypeValue = imageTypeDrafts[prompt._id] ?? prompt.imageType;
    const contentValue = drafts[prompt._id] ?? prompt.content;
    const promptKindValue =
      promptKindDrafts[prompt._id] ?? prompt.promptKind ?? "";
    const persistedBackground = promptBackgroundDraft(prompt);
    const backgroundValue = backgroundDrafts[prompt._id] ?? persistedBackground;
    const persistedAi = promptAiDraft(prompt);
    const aiValue = aiDrafts[prompt._id] ?? persistedAi;
    const imageTypeChanged = imageTypeValue.trim() !== prompt.imageType;
    const contentChanged = contentValue.trim() !== prompt.content.trim();
    const promptKindChanged =
      (promptKindDrafts[prompt._id] ?? prompt.promptKind ?? "") !==
      (prompt.promptKind ?? "");
    const backgroundChanged = !backgroundDraftsEqual(
      backgroundValue,
      persistedBackground,
    );
    const aiChanged = !promptAiDraftsEqual(aiValue, persistedAi);
    const hasChanges =
      imageTypeChanged ||
      contentChanged ||
      promptKindChanged ||
      backgroundChanged ||
      aiChanged;
    const canSaveChanges = Boolean(
      imageTypeValue.trim() && contentValue.trim(),
    );

    return {
      aiValue,
      backgroundValue,
      canSaveChanges,
      contentValue,
      hasChanges,
      imageTypeValue,
      promptKindValue,
    };
  }

  function updateImageTypeDraft(
    promptId: Id<"promptTemplates">,
    value: string,
  ) {
    setImageTypeDrafts((current) => ({ ...current, [promptId]: value }));
  }

  function clearImageTypeDraft(promptId: Id<"promptTemplates">) {
    setImageTypeDrafts((current) => deleteDraftValue(current, promptId));
    setEditingPromptNameId(null);
  }

  function updateContentDraft(promptId: Id<"promptTemplates">, value: string) {
    setDrafts((current) => ({ ...current, [promptId]: value }));
  }

  function updatePromptKindDraft(
    promptId: Id<"promptTemplates">,
    value: string,
  ) {
    setPromptKindDrafts((current) => ({ ...current, [promptId]: value }));
  }

  function updateAiDraft(
    prompt: Doc<"promptTemplates">,
    values: Partial<PromptAiDraft>,
  ) {
    const currentValue = aiDrafts[prompt._id] ?? promptAiDraft(prompt);
    setAiDrafts((current) => ({
      ...current,
      [prompt._id]: { ...currentValue, ...values },
    }));
  }

  function updateBackgroundDraft(
    prompt: Doc<"promptTemplates">,
    values: Partial<BackgroundDraft>,
  ) {
    const currentValue =
      backgroundDrafts[prompt._id] ?? promptBackgroundDraft(prompt);
    setBackgroundDrafts((current) => ({
      ...current,
      [prompt._id]: { ...currentValue, ...values },
    }));
  }

  async function savePrompt(promptId: Id<"promptTemplates">) {
    const prompt = orderedPrompts?.find((item) => item._id === promptId);
    if (!prompt) return;

    const imageType = (imageTypeDrafts[promptId] ?? prompt.imageType).trim();
    const content = (drafts[promptId] ?? prompt.content).trim();
    if (!imageType || !content) {
      toast.error("Image type content are required.");
      return;
    }
    setBusy(promptId);
    try {
      const backgroundDraft =
        backgroundDrafts[promptId] ?? promptBackgroundDraft(prompt);
      const aiDraft = aiDrafts[promptId] ?? promptAiDraft(prompt);
      const promptKind = promptKindDrafts[promptId] ?? prompt.promptKind ?? "";
      await updatePrompt({
        promptId,
        imageType,
        content,
        promptKind,
        ...aiDraft,
        ...backgroundDraft,
      });
      setDrafts((current) => deleteDraftValue(current, promptId));
      setImageTypeDrafts((current) => deleteDraftValue(current, promptId));
      setBackgroundDrafts((current) => deleteDraftValue(current, promptId));
      setPromptKindDrafts((current) => deleteDraftValue(current, promptId));
      setAiDrafts((current) => deleteDraftValue(current, promptId));
      setEditingPromptNameId(null);
      setActiveTab(imageType);
      toast.success(`Saved "${imageType}" template`);
    } catch (saveError) {
      toast.error("Failed save prompt", {
        description:
          saveError instanceof Error ? saveError.message : String(saveError),
      });
    } finally {
      setBusy(null);
    }
  }

  async function deletePrompt(promptId: Id<"promptTemplates">) {
    const prompt = orderedPrompts?.find((item) => item._id === promptId);
    setBusy(promptId);
    try {
      await removePrompt({ promptId });
      setDrafts((current) => deleteDraftValue(current, promptId));
      setImageTypeDrafts((current) => deleteDraftValue(current, promptId));
      setBackgroundDrafts((current) => deleteDraftValue(current, promptId));
      setPromptKindDrafts((current) => deleteDraftValue(current, promptId));
      setAiDrafts((current) => deleteDraftValue(current, promptId));
      if (editingPromptNameId === promptId) setEditingPromptNameId(null);
      removeFromLocalOrder(promptId);
      if (prompt && activeTab === prompt.imageType) {
        const nextPrompt = orderedPrompts?.find(
          (item) => item._id !== promptId,
        );
        setActiveTab(nextPrompt?.imageType);
      }
      setDeletePromptId(null);
      toast.success(`Deleted "${prompt?.label ?? "prompt"}" template`);
    } catch (deleteError) {
      toast.error("Failed delete prompt", {
        description:
          deleteError instanceof Error
            ? deleteError.message
            : String(deleteError),
      });
    } finally {
      setBusy(null);
    }
  }

  async function togglePreset(
    promptId: Id<"promptTemplates">,
    isPreset: boolean,
  ) {
    try {
      await setPreset({ promptId, isPreset });
    } catch (presetError) {
      toast.error("Failed update preset", {
        description:
          presetError instanceof Error
            ? presetError.message
            : String(presetError),
      });
    }
  }

  function startCreate() {
    setNewPromptAiTouched(false);
    setNewPromptDraft(
      (current) =>
        current ?? {
          imageType: "",
          content: "",
          promptKind: "",
          ...defaultPromptAiDraft,
          ...defaultBackgroundDraft,
        },
    );
    setActiveTab(newPromptTabValue);
  }

  function cancelCreate() {
    setNewPromptDraft(null);
    setNewPromptAiTouched(false);
    setActiveTab(orderedPrompts?.[0]?.imageType);
  }

  function updateNewPromptDraft(values: Partial<NewPromptDraft>) {
    setNewPromptDraft((current) =>
      current ? { ...current, ...values } : current,
    );
  }

  function newPromptAiValue(draft: NewPromptDraft): PromptAiDraft {
    return newPromptAiTouched
      ? {
          useVibeAnalysis: draft.useVibeAnalysis,
          referenceImageCount: draft.referenceImageCount,
        }
      : defaultAiDraftForPromptName(draft.imageType, draft.imageType);
  }

  function updateNewPromptAiDraft(values: Partial<PromptAiDraft>) {
    setNewPromptAiTouched(true);
    setNewPromptDraft((current) => {
      if (!current) return current;
      const base = newPromptAiTouched
        ? {
            useVibeAnalysis: current.useVibeAnalysis,
            referenceImageCount: current.referenceImageCount,
          }
        : defaultAiDraftForPromptName(current.imageType, current.imageType);
      return { ...current, ...base, ...values };
    });
  }

  async function create() {
    if (!newPromptDraft) return;
    const aiValues = newPromptAiTouched
      ? {
          useVibeAnalysis: newPromptDraft.useVibeAnalysis,
          referenceImageCount: newPromptDraft.referenceImageCount,
        }
      : {};
    const values = {
      imageType: newPromptDraft.imageType.trim(),
      label: newPromptDraft.imageType.trim(),
      content: newPromptDraft.content.trim(),
      promptKind: newPromptDraft.promptKind || undefined,
      ...aiValues,
      removeBackground: newPromptDraft.removeBackground,
      backgroundMode: newPromptDraft.backgroundMode,
      backgroundColor: newPromptDraft.backgroundColor.trim(),
      backgroundShadow: newPromptDraft.backgroundShadow,
    };
    if (!values.imageType || !values.content) {
      toast.error("Image type content are required.");
      return;
    }
    setBusy("create");
    try {
      await createPrompt(values);
      setActiveTab(values.imageType.trim());
      setNewPromptDraft(null);
      setNewPromptAiTouched(false);
      toast.success(`Created "${values.label}" template`);
    } catch (createError) {
      toast.error("Failed create template", {
        description:
          createError instanceof Error
            ? createError.message
            : String(createError),
      });
    } finally {
      setBusy(null);
    }
  }

  return {
    activeTab,
    canCreatePrompt,
    currentTab,
    deletePromptId,
    deleteTarget,
    editingPromptNameId,
    imageTypeDrafts,
    newPromptDraft,
    cancelCreate,
    clearImageTypeDraft,
    closeDeletePrompt: () => setDeletePromptId(null),
    create,
    deletePrompt,
    getPromptEditorState,
    newPromptAiValue,
    openDeletePrompt: setDeletePromptId,
    savePrompt,
    setActiveTab,
    setEditingPromptNameId,
    startCreate,
    togglePreset,
    updateAiDraft,
    updateBackgroundDraft,
    updateContentDraft,
    updateImageTypeDraft,
    updateNewPromptAiDraft,
    updateNewPromptDraft,
    updatePromptKindDraft,
  };
}
