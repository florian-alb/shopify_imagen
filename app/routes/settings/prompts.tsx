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

type NewPromptDraft = {
  imageType: string;
  label: string;
  content: string;
};

type MasterPromptSettings = {
  shopId: string | null;
  masterPrompt: string;
  defaultMasterPrompt: string;
  updatedAt: number | null;
};

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
  const resetPrompt = useMutation(api.prompts.reset);
  const reorderPrompts = useMutation(api.prompts.reorder);
  const removePrompt = useMutation(api.prompts.remove);
  const setPreset = useMutation(api.prompts.setPreset);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [masterDraft, setMasterDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string | undefined>(undefined);
  const [newPromptDraft, setNewPromptDraft] = useState<NewPromptDraft | null>(
    null,
  );
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
    if (!masterPromptValue) {
      toast.error("Master prompt cannot be empty.");
      return;
    }
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
    const content = drafts[promptId]?.trim();
    if (!content) {
      toast.error("Prompt content cannot be empty.");
      return;
    }
    setBusy(promptId);
    try {
      await updatePrompt({ promptId, content });
      setDrafts((current) => {
        const next = { ...current };
        delete next[promptId];
        return next;
      });
      toast.success("Prompt template saved");
    } catch (saveError) {
      toast.error("Failed to save prompt", {
        description:
          saveError instanceof Error ? saveError.message : String(saveError),
      });
    } finally {
      setBusy(null);
    }
  }

  async function reset(promptId: Id<"promptTemplates">) {
    setBusy(promptId);
    try {
      await resetPrompt({ promptId });
      setDrafts((current) => {
        const next = { ...current };
        delete next[promptId];
        return next;
      });
      toast.success("Prompt reset to default");
    } catch (resetError) {
      toast.error("Failed to reset prompt", {
        description:
          resetError instanceof Error ? resetError.message : String(resetError),
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
    setNewPromptDraft(
      (current) => current ?? { imageType: "", label: "", content: "" },
    );
    setActiveTab(newPromptTabValue);
  }

  function cancelCreate() {
    setNewPromptDraft(null);
    setActiveTab(orderedPrompts?.[0]?.imageType);
  }

  function updateNewPromptDraft(values: Partial<NewPromptDraft>) {
    setNewPromptDraft((current) =>
      current ? { ...current, ...values } : current,
    );
  }

  async function create() {
    if (!newPromptDraft) return;
    const values = {
      imageType: newPromptDraft.imageType.trim(),
      label: newPromptDraft.label.trim(),
      content: newPromptDraft.content.trim(),
    };
    if (!values.imageType || !values.label || !values.content) {
      toast.error("Image type, label, and content are required.");
      return;
    }
    setBusy("create");
    try {
      await createPrompt(values);
      setActiveTab(values.imageType.trim());
      setNewPromptDraft(null);
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
    newPromptDraft.label.trim() &&
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
                  Instructions communes ajoutees avant chaque template lors de
                  la generation.
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
              <div className="flex min-h-32 h-full items-center gap-2 text-sm text-muted-foreground">
                <BusyIcon busy />
                Chargement du master prompt.
              </div>
            ) : (
              <>
                <Textarea
                  className="min-h-[16rem] font-mono text-xs leading-relaxed"
                  value={masterPromptValue}
                  onChange={(event) => setMasterDraft(event.target.value)}
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
              </>
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
                <span className="truncate">{prompt.label}</span>
              </TabsTrigger>
            ))}
            {newPromptDraft ? (
              <TabsTrigger
                value={newPromptTabValue}
                className="min-h-10 w-full justify-start gap-2 rounded-md border border-primary/30 bg-primary/10 px-3 text-sm font-medium text-foreground data-[state=inactive]:hover:bg-primary/15"
              >
                <Plus className="size-3 shrink-0 opacity-70" />
                <span className="truncate">
                  {newPromptDraft.label.trim() || "Nouveau template"}
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
                  <div className="grid gap-3 md:grid-cols-2">
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
                    <div className="grid gap-1.5">
                      <Label htmlFor="prompt-label">Label</Label>
                      <Input
                        id="prompt-label"
                        placeholder="ex. Detail shot"
                        value={newPromptDraft.label}
                        onChange={(event) =>
                          updateNewPromptDraft({ label: event.target.value })
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

          {orderedPrompts.map((prompt) => (
            <TabsContent key={prompt._id} value={prompt.imageType}>
              <Card className="studio-card rounded-lg">
                <CardHeader className="flex flex-row items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-lg">{prompt.label}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {prompt.imageType}
                    </p>
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
                    <StateBadge state={prompt.isActive ? "success" : "warning"}>
                      {prompt.isActive ? "Active" : "Inactive"}
                    </StateBadge>
                  </div>
                </CardHeader>
                <CardContent>
                  <Textarea
                    className="min-h-[28rem] font-mono text-xs leading-relaxed"
                    value={drafts[prompt._id] ?? prompt.content}
                    onChange={(event) =>
                      setDrafts((current) => ({
                        ...current,
                        [prompt._id]: event.target.value,
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
                    <Button
                      variant="outline"
                      onClick={() => void reset(prompt._id)}
                      disabled={busy === prompt._id}
                    >
                      <BusyIcon busy={busy === prompt._id} />
                      {busy !== prompt._id ? (
                        <RotateCcw data-icon="inline-start" />
                      ) : null}
                      Reset
                    </Button>
                    <Button
                      onClick={() => void save(prompt._id)}
                      disabled={busy === prompt._id}
                    >
                      <BusyIcon busy={busy === prompt._id} />
                      {busy !== prompt._id ? (
                        <Save data-icon="inline-start" />
                      ) : null}
                      Enregistrer
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          ))}
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
