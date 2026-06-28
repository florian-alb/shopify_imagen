import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { GripVertical, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  BusyIcon,
  EmptyState,
  PageHeader,
  StateBadge,
} from "@/components/page";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";

export const Route = createFileRoute("/settings/prompts")({
  component: PromptSettingsPage,
});

const supportedVariables = [
  "{{PRODUCT_TITLE}}",
  "{{PRODUCT_HANDLE}}",
  "{{IMAGE_TYPE}}",
];
const newPromptTabValue = "__new-template__";

type BackgroundMode = "solid" | "transparent";

type BackgroundDraft = {
  removeBackground: boolean;
  backgroundMode: BackgroundMode;
  backgroundColor: string;
  backgroundShadow: boolean;
};

type PromptAiDraft = {
  useVibeAnalysis: boolean;
  referenceImageCount: number;
};

type NewPromptDraft = {
  imageType: string;
  content: string;
} & BackgroundDraft &
  PromptAiDraft;

type MasterPromptSettings = {
  shopId: string | null;
  masterPrompt: string;
  defaultMasterPrompt: string;
  updatedAt: number | null;
};

const defaultBackgroundDraft: BackgroundDraft = {
  removeBackground: false,
  backgroundMode: "solid",
  backgroundColor: "#ffffff",
  backgroundShadow: true,
};

const defaultPromptAiDraft: PromptAiDraft = {
  useVibeAnalysis: true,
  referenceImageCount: 2,
};

function normalizePromptName(value?: string | null) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/\s*-\s*/g, " - ")
    .replace(/\s+/g, " ");
}

function defaultAiDraftForPromptName(
  imageType: string,
  label?: string | null,
): PromptAiDraft {
  const names = [normalizePromptName(imageType), normalizePromptName(label)];
  if (names.some((name) => name.startsWith("studio - "))) {
    return { useVibeAnalysis: false, referenceImageCount: 1 };
  }
  if (
    names.some(
      (name) =>
        name.startsWith("on-foot - ") || name.startsWith("lifestyle - "),
    )
  ) {
    return { useVibeAnalysis: true, referenceImageCount: 2 };
  }
  return defaultPromptAiDraft;
}

function normalizeReferenceImageCount(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(4, Math.max(1, Math.round(value)));
}

function promptAiDraft(prompt: Doc<"promptTemplates">): PromptAiDraft {
  const defaults = defaultAiDraftForPromptName(prompt.imageType, prompt.label);
  return {
    useVibeAnalysis: prompt.useVibeAnalysis ?? defaults.useVibeAnalysis,
    referenceImageCount: normalizeReferenceImageCount(
      prompt.referenceImageCount ?? defaults.referenceImageCount,
    ),
  };
}

function promptBackgroundDraft(
  prompt: Doc<"promptTemplates">,
): BackgroundDraft {
  return {
    removeBackground: prompt.removeBackground === true,
    backgroundMode:
      prompt.backgroundMode === "transparent" ? "transparent" : "solid",
    backgroundColor:
      prompt.backgroundColor ?? defaultBackgroundDraft.backgroundColor,
    backgroundShadow:
      prompt.backgroundShadow ?? defaultBackgroundDraft.backgroundShadow,
  };
}

function backgroundDraftsEqual(left: BackgroundDraft, right: BackgroundDraft) {
  return (
    left.removeBackground === right.removeBackground &&
    left.backgroundMode === right.backgroundMode &&
    left.backgroundColor.toLowerCase() ===
      right.backgroundColor.toLowerCase() &&
    left.backgroundShadow === right.backgroundShadow
  );
}

function promptAiDraftsEqual(left: PromptAiDraft, right: PromptAiDraft) {
  return (
    left.useVibeAnalysis === right.useVibeAnalysis &&
    left.referenceImageCount === right.referenceImageCount
  );
}

function PromptAiControls({
  idPrefix,
  draft,
  onChange,
}: {
  idPrefix: string;
  draft: PromptAiDraft;
  onChange: (values: Partial<PromptAiDraft>) => void;
}) {
  return (
    <section className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-foreground">Reglages IA</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Analyse visuelle et references envoyees pour ce prompt.
          </p>
        </div>
        <Label className="flex h-8 cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-background/40 px-3 text-sm">
          <Checkbox
            checked={draft.useVibeAnalysis}
            onCheckedChange={(checked) =>
              onChange({ useVibeAnalysis: checked === true })
            }
          />
          Analyse visuelle
        </Label>
      </div>
      <div className="mt-3 grid gap-1.5 md:max-w-44">
        <Label htmlFor={`${idPrefix}-reference-count`}>
          Images de reference
        </Label>
        <Input
          id={`${idPrefix}-reference-count`}
          type="number"
          min={1}
          max={4}
          step={1}
          value={draft.referenceImageCount}
          onChange={(event) =>
            onChange({
              referenceImageCount: normalizeReferenceImageCount(
                Number(event.target.value),
              ),
            })
          }
        />
      </div>
    </section>
  );
}

function BackgroundControls({
  idPrefix,
  draft,
  onChange,
}: {
  idPrefix: string;
  draft: BackgroundDraft;
  onChange: (values: Partial<BackgroundDraft>) => void;
}) {
  return (
    <section className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-foreground">
            Detourage IA experimental
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Post-traitement FAL facultatif configure pour ce type d'image.
          </p>
        </div>
        <Label className="flex h-8 cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-background/40 px-3 text-sm">
          <Checkbox
            checked={draft.removeBackground}
            onCheckedChange={(checked) =>
              onChange({ removeBackground: checked === true })
            }
          />
          Activer le detourage IA
        </Label>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_auto]">
        <div className="grid gap-1.5">
          <Label htmlFor={`${idPrefix}-mode`}>Fond final</Label>
          <Select
            value={draft.backgroundMode}
            onValueChange={(value) =>
              onChange({ backgroundMode: value as BackgroundMode })
            }
            disabled={!draft.removeBackground}
          >
            <SelectTrigger id={`${idPrefix}-mode`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="solid">Couleur unie</SelectItem>
              <SelectItem value="transparent">Transparent</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor={`${idPrefix}-color`}>Couleur</Label>
          <div className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-2">
            <Input
              id={`${idPrefix}-color-picker`}
              type="color"
              value={draft.backgroundColor}
              onChange={(event) =>
                onChange({ backgroundColor: event.target.value })
              }
              disabled={
                !draft.removeBackground || draft.backgroundMode !== "solid"
              }
              className="h-9 w-11 p-1"
            />
            <Input
              id={`${idPrefix}-color`}
              value={draft.backgroundColor}
              onChange={(event) =>
                onChange({ backgroundColor: event.target.value })
              }
              disabled={
                !draft.removeBackground || draft.backgroundMode !== "solid"
              }
              className="font-mono"
              placeholder="#ffffff"
            />
          </div>
        </div>

        <Label className="mt-6 flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-background/40 px-3 text-sm">
          <Checkbox
            checked={draft.backgroundShadow}
            onCheckedChange={(checked) =>
              onChange({ backgroundShadow: checked === true })
            }
            disabled={!draft.removeBackground}
          />
          Ombre douce
        </Label>
      </div>
    </section>
  );
}

function compilePromptPreview(masterPrompt: string, templatePrompt: string) {
  const master = masterPrompt.trim();
  const template = templatePrompt.trim();
  if (!master) return template;
  if (!template) return master;
  if (template.startsWith(master)) return template;
  return `${master}\n\n${template}`;
}

function PromptSettingsPage() {
  const prompts = useQuery(api.prompts.list) as
    | Doc<"promptTemplates">[]
    | undefined;
  const masterPrompt = useQuery(api.prompts.master) as
    | MasterPromptSettings
    | undefined;
  const createPrompt = useMutation(api.prompts.create);
  const updatePrompt = useMutation(api.prompts.update);
  const updateMasterPrompt = useMutation(api.prompts.updateMaster);
  const resetMasterPrompt = useMutation(api.prompts.resetMaster);
  const reorderPrompts = useMutation(api.prompts.reorder);
  const removePrompt = useMutation(api.prompts.remove);
  const setPreset = useMutation(api.prompts.setPreset);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [imageTypeDrafts, setImageTypeDrafts] = useState<
    Record<string, string>
  >({});
  const [backgroundDrafts, setBackgroundDrafts] = useState<
    Record<string, BackgroundDraft>
  >({});
  const [aiDrafts, setAiDrafts] = useState<Record<string, PromptAiDraft>>({});
  const [masterDraft, setMasterDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string | undefined>(undefined);
  const [newPromptDraft, setNewPromptDraft] = useState<NewPromptDraft | null>(
    null,
  );
  const [newPromptAiTouched, setNewPromptAiTouched] = useState(false);
  const [editingPromptNameId, setEditingPromptNameId] =
    useState<Id<"promptTemplates"> | null>(null);
  const [deletePromptId, setDeletePromptId] =
    useState<Id<"promptTemplates"> | null>(null);
  // Drag-and-drop reordering state. `localOrder` holds an optimistic ordering of
  // prompt ids while dragging (and until Convex reflects the saved order), so the
  // tabs reorder live without a flash back to the server order on drop.
  const [dragId, setDragId] = useState<Id<"promptTemplates"> | null>(null);
  const [localOrder, setLocalOrder] = useState<Id<"promptTemplates">[] | null>(
    null,
  );

  useEffect(() => {
    setMasterDraft(null);
  }, [masterPrompt?.shopId]);

  // Once the server order matches our optimistic order, drop the override.
  useEffect(() => {
    if (!localOrder || !prompts) return;
    const serverOrder = prompts.map((prompt) => prompt._id);
    if (
      serverOrder.length === localOrder.length &&
      serverOrder.every((id, index) => id === localOrder[index])
    ) {
      setLocalOrder(null);
    }
  }, [prompts, localOrder]);

  const orderedPrompts =
    localOrder && prompts
      ? (localOrder
          .map((id) => prompts.find((prompt) => prompt._id === id))
          .filter(Boolean) as Doc<"promptTemplates">[])
      : prompts;

  function reorderOver(overId: Id<"promptTemplates">) {
    if (!dragId || dragId === overId || !orderedPrompts) return;
    const ids = orderedPrompts.map((prompt) => prompt._id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(overId);
    if (from === -1 || to === -1) return;
    ids.splice(from, 1);
    ids.splice(to, 0, dragId);
    setLocalOrder(ids);
  }

  async function commitReorder() {
    // onDrop and onDragEnd both fire on a successful drop; only the first (while
    // dragId is still set) should persist.
    if (!dragId) return;
    const ids = orderedPrompts?.map((prompt) => prompt._id);
    setDragId(null);
    if (!ids || !localOrder) return;
    try {
      await reorderPrompts({ orderedIds: ids });
      toast.success("Prompt order saved");
    } catch (reorderError) {
      setLocalOrder(null);
      toast.error("Failed to reorder prompts", {
        description:
          reorderError instanceof Error
            ? reorderError.message
            : String(reorderError),
      });
    }
  }

  async function saveMaster() {
    const masterPromptValue = (
      masterDraft ??
      masterPrompt?.masterPrompt ??
      ""
    ).trim();
    setBusy("master");
    try {
      await updateMasterPrompt({ masterPrompt: masterPromptValue });
      setMasterDraft(null);
      toast.success("Master prompt saved");
    } catch (saveError) {
      toast.error("Failed to save master prompt", {
        description:
          saveError instanceof Error ? saveError.message : String(saveError),
      });
    } finally {
      setBusy(null);
    }
  }

  async function resetMaster() {
    setBusy("master");
    try {
      await resetMasterPrompt({});
      setMasterDraft(null);
      toast.success("Master prompt reset to default");
    } catch (resetError) {
      toast.error("Failed to reset master prompt", {
        description:
          resetError instanceof Error ? resetError.message : String(resetError),
      });
    } finally {
      setBusy(null);
    }
  }

  async function save(promptId: Id<"promptTemplates">) {
    const prompt = orderedPrompts?.find((item) => item._id === promptId);
    if (!prompt) return;

    const imageType = (imageTypeDrafts[promptId] ?? prompt.imageType).trim();
    const content = (drafts[promptId] ?? prompt.content).trim();
    if (!imageType || !content) {
      toast.error("Image type and content are required.");
      return;
    }
    setBusy(promptId);
    try {
      const backgroundDraft =
        backgroundDrafts[promptId] ?? promptBackgroundDraft(prompt);
      const aiDraft = aiDrafts[promptId] ?? promptAiDraft(prompt);
      await updatePrompt({
        promptId,
        imageType,
        content,
        ...aiDraft,
        ...backgroundDraft,
      });
      setDrafts((current) => {
        const next = { ...current };
        delete next[promptId];
        return next;
      });
      setImageTypeDrafts((current) => {
        const next = { ...current };
        delete next[promptId];
        return next;
      });
      setBackgroundDrafts((current) => {
        const next = { ...current };
        delete next[promptId];
        return next;
      });
      setAiDrafts((current) => {
        const next = { ...current };
        delete next[promptId];
        return next;
      });
      setEditingPromptNameId(null);
      setActiveTab(imageType);
      toast.success(`Saved "${imageType}" template`);
    } catch (saveError) {
      toast.error("Failed to save prompt", {
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
      setDrafts((current) => {
        const next = { ...current };
        delete next[promptId];
        return next;
      });
      setImageTypeDrafts((current) => {
        const next = { ...current };
        delete next[promptId];
        return next;
      });
      setBackgroundDrafts((current) => {
        const next = { ...current };
        delete next[promptId];
        return next;
      });
      setAiDrafts((current) => {
        const next = { ...current };
        delete next[promptId];
        return next;
      });
      if (editingPromptNameId === promptId) setEditingPromptNameId(null);
      setLocalOrder((current) =>
        current ? current.filter((id) => id !== promptId) : current,
      );
      if (prompt && activeTab === prompt.imageType) {
        const nextPrompt = orderedPrompts?.find(
          (item) => item._id !== promptId,
        );
        setActiveTab(nextPrompt?.imageType);
      }
      setDeletePromptId(null);
      toast.success(`Deleted "${prompt?.label ?? "prompt"}" template`);
    } catch (deleteError) {
      toast.error("Failed to delete prompt", {
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
      toast.error("Failed to update preset", {
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
      ...aiValues,
      removeBackground: newPromptDraft.removeBackground,
      backgroundMode: newPromptDraft.backgroundMode,
      backgroundColor: newPromptDraft.backgroundColor.trim(),
      backgroundShadow: newPromptDraft.backgroundShadow,
    };
    if (!values.imageType || !values.content) {
      toast.error("Image type and content are required.");
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
      toast.error("Failed to create template", {
        description:
          createError instanceof Error
            ? createError.message
            : String(createError),
      });
    } finally {
      setBusy(null);
    }
  }

  const masterPromptValue = masterDraft ?? masterPrompt?.masterPrompt ?? "";
  const masterPromptDirty = Boolean(
    masterPrompt &&
    masterPromptValue.trim() !== masterPrompt.masterPrompt.trim(),
  );
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

  return (
    <main className="page">
      <PageHeader
        eyebrow="Configuration"
        title="Prompts"
        action={
          <div className="flex gap-2">
            <Button size="sm" onClick={startCreate}>
              <Plus data-icon="inline-start" />
              Template
            </Button>
          </div>
        }
      >
        Editeur des prompts utilises par les generations image.
      </PageHeader>

      <Card className="studio-card mb-4 rounded-lg">
        <CardHeader>
          <CardTitle>Variables disponibles</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {supportedVariables.map((item) => (
            <Badge
              key={item}
              variant="secondary"
              className="h-6 border border-border bg-secondary px-2.5 font-mono text-[0.72rem] text-secondary-foreground"
            >
              {item}
            </Badge>
          ))}
        </CardContent>
      </Card>

      <Accordion
        type="single"
        collapsible
        className="studio-card mb-4 rounded-lg border border-white/10 bg-card/80 px-4"
      >
        <AccordionItem value="master-prompt" className="border-0">
          <AccordionTrigger className="py-4 hover:no-underline">
            <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-3 pr-2">
              <div className="text-left">
                <div className="text-base font-medium text-foreground">
                  Master Prompt
                </div>
                <p className="mt-1 text-sm font-normal text-muted-foreground">
                  Instructions communes optionnelles. Si le champ est vide,
                  seuls les templates sont utilises.
                </p>
              </div>
              <Badge
                variant="secondary"
                className="border border-border bg-secondary px-2.5"
              >
                Boutique active
              </Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pb-4">
            {masterPrompt === undefined ? (
              <div className="flex min-h-32 items-center gap-2 text-sm text-muted-foreground">
                <BusyIcon busy />
                Chargement du master prompt.
              </div>
            ) : (
              <div className="flex flex-col gap-2 h-96">
                <Textarea
                  className="min-h-[16rem] font-mono text-xs leading-relaxed"
                  value={masterPromptValue}
                  onChange={(event) => setMasterDraft(event.target.value)}
                  placeholder="Laissez vide pour generer uniquement avec les templates."
                />
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => void resetMaster()}
                    disabled={busy === "master"}
                  >
                    <BusyIcon busy={busy === "master"} />
                    {busy !== "master" ? (
                      <RotateCcw data-icon="inline-start" />
                    ) : null}
                    Reset
                  </Button>
                  <Button
                    onClick={() => void saveMaster()}
                    disabled={busy === "master" || !masterPromptDirty}
                  >
                    <BusyIcon busy={busy === "master"} />
                    {busy !== "master" ? (
                      <Save data-icon="inline-start" />
                    ) : null}
                    Enregistrer
                  </Button>
                </div>
              </div>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {orderedPrompts === undefined ? (
        <EmptyState
          loading
          title="Chargement des prompts"
          body="Lecture des templates depuis Convex."
        />
      ) : orderedPrompts.length === 0 && !newPromptDraft ? (
        <EmptyState
          title="Aucun prompt"
          body="Creez un template pour demarrer les generations."
          children={
            <Button size="sm" onClick={startCreate}>
              <Plus data-icon="inline-start" />
              Nouveau template
            </Button>
          }
        />
      ) : (
        <Tabs
          value={currentTab}
          onValueChange={setActiveTab}
          className="grid gap-4 xl:grid-cols-[18rem_minmax(0,1fr)]"
        >
          <p className="text-xs text-muted-foreground xl:col-span-2">
            Glissez les templates pour definir l'ordre de publication Shopify.
          </p>
          <TabsList className="h-auto w-full max-w-full flex-wrap justify-start overflow-x-auto rounded-lg border border-white/10 bg-white/[0.03] p-2 xl:flex xl:flex-col xl:items-stretch xl:self-start xl:overflow-visible">
            {orderedPrompts.map((prompt) => (
              <TabsTrigger
                key={prompt._id}
                value={prompt.imageType}
                draggable
                onDragStart={(event) => {
                  setDragId(prompt._id);
                  event.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  reorderOver(prompt._id);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  void commitReorder();
                }}
                onDragEnd={() => void commitReorder()}
                data-dragging={dragId === prompt._id ? "" : undefined}
                className={`min-h-10 w-full cursor-grab justify-start gap-2 rounded-md border border-transparent px-3 text-sm font-medium text-muted-foreground active:cursor-grabbing data-[dragging]:opacity-50 data-[state=active]:border-primary/30 data-[state=active]:bg-primary/15 data-[state=active]:text-foreground data-[state=inactive]:hover:bg-muted/70 data-[state=inactive]:hover:text-foreground${
                  prompt.isPreset
                    ? " after:ml-auto after:size-1.5 after:rounded-full after:bg-primary after:content-['']"
                    : ""
                }`}
              >
                <GripVertical className="size-3 shrink-0 opacity-50" />
                <span className="truncate">
                  {imageTypeDrafts[prompt._id]?.trim() || prompt.imageType}
                </span>
              </TabsTrigger>
            ))}
            {newPromptDraft ? (
              <TabsTrigger
                value={newPromptTabValue}
                className="min-h-10 w-full justify-start gap-2 rounded-md border border-primary/30 bg-primary/10 px-3 text-sm font-medium text-foreground data-[state=inactive]:hover:bg-primary/15"
              >
                <Plus className="size-3 shrink-0 opacity-70" />
                <span className="truncate">
                  {newPromptDraft.imageType.trim() || "Nouveau template"}
                </span>
              </TabsTrigger>
            ) : null}
          </TabsList>

          {newPromptDraft ? (
            <TabsContent value={newPromptTabValue}>
              <Card className="studio-card rounded-lg">
                <CardHeader className="flex flex-row items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-lg">Nouveau template</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Brouillon non enregistre
                    </p>
                  </div>
                  <Badge
                    variant="secondary"
                    className="border border-border bg-secondary px-2.5"
                  >
                    Creation
                  </Badge>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3">
                    <div className="grid gap-1.5">
                      <Label htmlFor="prompt-image-type">Type image</Label>
                      <Input
                        id="prompt-image-type"
                        placeholder="ex. detail-shot"
                        value={newPromptDraft.imageType}
                        onChange={(event) =>
                          updateNewPromptDraft({
                            imageType: event.target.value,
                          })
                        }
                      />
                    </div>
                  </div>
                  <div className="mt-3 grid gap-1.5">
                    <Label htmlFor="prompt-content">Prompt specifique</Label>
                    <Textarea
                      id="prompt-content"
                      className="min-h-[28rem] font-mono text-xs leading-relaxed"
                      placeholder="Decrivez l'image a generer. Utilisez {{PRODUCT_TITLE}} si besoin."
                      value={newPromptDraft.content}
                      onChange={(event) =>
                        updateNewPromptDraft({ content: event.target.value })
                      }
                    />
                  </div>
                  <PromptAiControls
                    idPrefix="new-prompt-ai"
                    draft={newPromptAiValue(newPromptDraft)}
                    onChange={updateNewPromptAiDraft}
                  />
                  <BackgroundControls
                    idPrefix="new-prompt-background"
                    draft={newPromptDraft}
                    onChange={updateNewPromptDraft}
                  />
                  <div className="sticky bottom-0 -mx-4 mt-3 flex justify-end gap-2 border-t border-white/10 bg-card/95 px-4 py-3 backdrop-blur">
                    <Button
                      variant="outline"
                      onClick={cancelCreate}
                      disabled={busy === "create"}
                    >
                      Annuler
                    </Button>
                    <Button
                      onClick={() => void create()}
                      disabled={!canCreatePrompt}
                    >
                      <BusyIcon busy={busy === "create"} />
                      {busy !== "create" ? (
                        <Plus data-icon="inline-start" />
                      ) : null}
                      Creer
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          ) : null}

          {orderedPrompts.map((prompt) => {
            const imageTypeValue =
              imageTypeDrafts[prompt._id] ?? prompt.imageType;
            const contentValue = drafts[prompt._id] ?? prompt.content;
            const persistedBackground = promptBackgroundDraft(prompt);
            const backgroundValue =
              backgroundDrafts[prompt._id] ?? persistedBackground;
            const persistedAi = promptAiDraft(prompt);
            const aiValue = aiDrafts[prompt._id] ?? persistedAi;
            const imageTypeChanged = imageTypeValue.trim() !== prompt.imageType;
            const contentChanged =
              contentValue.trim() !== prompt.content.trim();
            const backgroundChanged = !backgroundDraftsEqual(
              backgroundValue,
              persistedBackground,
            );
            const aiChanged = !promptAiDraftsEqual(aiValue, persistedAi);
            const hasChanges =
              imageTypeChanged ||
              contentChanged ||
              backgroundChanged ||
              aiChanged;
            const canSaveChanges = Boolean(
              imageTypeValue.trim() && contentValue.trim(),
            );

            return (
              <TabsContent key={prompt._id} value={prompt.imageType}>
                <Card className="studio-card rounded-lg">
                  <CardHeader className="flex flex-row items-start justify-between gap-2">
                    <div>
                      {editingPromptNameId === prompt._id ? (
                        <Input
                          aria-label="Nom du prompt"
                          autoFocus
                          className="h-10 text-lg"
                          value={imageTypeValue}
                          onBlur={() => setEditingPromptNameId(null)}
                          onChange={(event) =>
                            setImageTypeDrafts((current) => ({
                              ...current,
                              [prompt._id]: event.target.value,
                            }))
                          }
                          onKeyDown={(event) => {
                            if (event.key === "Escape") {
                              setImageTypeDrafts((current) => {
                                const next = { ...current };
                                delete next[prompt._id];
                                return next;
                              });
                              setEditingPromptNameId(null);
                            }
                            if (event.key === "Enter" && canSaveChanges) {
                              event.currentTarget.blur();
                              void save(prompt._id);
                            }
                          }}
                        />
                      ) : (
                        <CardTitle className="text-lg">
                          <button
                            type="button"
                            className="text-left hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            onClick={() => setEditingPromptNameId(prompt._id)}
                          >
                            {imageTypeValue.trim() || prompt.imageType}
                          </button>
                        </CardTitle>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <Label className="flex h-8 cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 text-sm">
                        <Checkbox
                          checked={prompt.isPreset === true}
                          onCheckedChange={(checked) =>
                            void togglePreset(prompt._id, checked === true)
                          }
                        />
                        Preset
                      </Label>
                      <StateBadge
                        state={prompt.isActive ? "success" : "warning"}
                      >
                        {prompt.isActive ? "Active" : "Inactive"}
                      </StateBadge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-1.5">
                      <Label htmlFor={`prompt-content-${prompt._id}`}>
                        Prompt specifique
                      </Label>
                      <Textarea
                        id={`prompt-content-${prompt._id}`}
                        className="min-h-[28rem] max-h-96 font-mono text-xs leading-relaxed"
                        value={contentValue}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [prompt._id]: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <PromptAiControls
                      idPrefix={`prompt-ai-${prompt._id}`}
                      draft={aiValue}
                      onChange={(values) =>
                        setAiDrafts((current) => ({
                          ...current,
                          [prompt._id]: { ...aiValue, ...values },
                        }))
                      }
                    />
                    <BackgroundControls
                      idPrefix={`prompt-background-${prompt._id}`}
                      draft={backgroundValue}
                      onChange={(values) =>
                        setBackgroundDrafts((current) => ({
                          ...current,
                          [prompt._id]: { ...backgroundValue, ...values },
                        }))
                      }
                    />

                    <div className="mt-3 flex justify-end gap-2">
                      <Button
                        variant="destructive"
                        onClick={() => setDeletePromptId(prompt._id)}
                        disabled={busy === prompt._id}
                      >
                        <Trash2 data-icon="inline-start" />
                        Supprimer
                      </Button>
                      {hasChanges ? (
                        <Button
                          onClick={() => void save(prompt._id)}
                          disabled={busy === prompt._id || !canSaveChanges}
                        >
                          <BusyIcon busy={busy === prompt._id} />
                          {busy !== prompt._id ? (
                            <Save data-icon="inline-start" />
                          ) : null}
                          Enregistrer
                        </Button>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            );
          })}
        </Tabs>
      )}

      {deleteTarget ? (
        <AlertDialog
          open={deletePromptId !== null}
          onOpenChange={(open) => {
            if (!open && busy !== deleteTarget._id) setDeletePromptId(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Supprimer ce prompt ?</AlertDialogTitle>
              <AlertDialogDescription>
                Cette action supprime uniquement le prompt de la boutique
                active. Les autres boutiques gardent leurs propres prompts.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy === deleteTarget._id}>
                Annuler
              </AlertDialogCancel>
              <Button
                variant="destructive"
                disabled={busy === deleteTarget._id}
                onClick={() => void deletePrompt(deleteTarget._id)}
              >
                <BusyIcon busy={busy === deleteTarget._id} />
                {busy !== deleteTarget._id ? (
                  <Trash2 data-icon="inline-start" />
                ) : null}
                Supprimer
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </main>
  );
}
