import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { GripVertical, Plus, RotateCcw, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { BusyIcon, EmptyState, PageHeader, StateBadge } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";

export const Route = createFileRoute("/settings/prompts")({
  component: PromptSettingsPage
});

const supportedVariables = ["{{PRODUCT_TITLE}}", "{{PRODUCT_HANDLE}}", "{{IMAGE_TYPE}}"];

function PromptSettingsPage() {
  const prompts = useQuery(api.prompts.list) as Doc<"promptTemplates">[] | undefined;
  const seedDefaults = useMutation(api.prompts.seedDefaults);
  const createPrompt = useMutation(api.prompts.create);
  const updatePrompt = useMutation(api.prompts.update);
  const resetPrompt = useMutation(api.prompts.reset);
  const reorderPrompts = useMutation(api.prompts.reorder);
  const setPreset = useMutation(api.prompts.setPreset);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string | undefined>(undefined);
  const [createOpen, setCreateOpen] = useState(false);
  // Drag-and-drop reordering state. `localOrder` holds an optimistic ordering of
  // prompt ids while dragging (and until Convex reflects the saved order), so the
  // tabs reorder live without a flash back to the server order on drop.
  const [dragId, setDragId] = useState<Id<"promptTemplates"> | null>(null);
  const [localOrder, setLocalOrder] = useState<Id<"promptTemplates">[] | null>(null);

  useEffect(() => {
    if (prompts && prompts.length === 0) void seedDefaults({});
  }, [prompts, seedDefaults]);

  // Once the server order matches our optimistic order, drop the override.
  useEffect(() => {
    if (!localOrder || !prompts) return;
    const serverOrder = prompts.map((prompt) => prompt._id);
    if (serverOrder.length === localOrder.length && serverOrder.every((id, index) => id === localOrder[index])) {
      setLocalOrder(null);
    }
  }, [prompts, localOrder]);

  const orderedPrompts =
    localOrder && prompts
      ? (localOrder.map((id) => prompts.find((prompt) => prompt._id === id)).filter(Boolean) as Doc<"promptTemplates">[])
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
        description: reorderError instanceof Error ? reorderError.message : String(reorderError)
      });
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
        description: saveError instanceof Error ? saveError.message : String(saveError)
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
        description: resetError instanceof Error ? resetError.message : String(resetError)
      });
    } finally {
      setBusy(null);
    }
  }

  async function togglePreset(promptId: Id<"promptTemplates">, isPreset: boolean) {
    try {
      await setPreset({ promptId, isPreset });
    } catch (presetError) {
      toast.error("Failed to update preset", {
        description: presetError instanceof Error ? presetError.message : String(presetError)
      });
    }
  }

  async function create(values: { imageType: string; label: string; content: string }) {
    setBusy("create");
    try {
      await createPrompt(values);
      setActiveTab(values.imageType.trim());
      setCreateOpen(false);
      toast.success(`Created "${values.label}" template`);
    } catch (createError) {
      toast.error("Failed to create template", {
        description: createError instanceof Error ? createError.message : String(createError)
      });
    } finally {
      setBusy(null);
    }
  }

  async function seed() {
    try {
      await seedDefaults({});
      toast.success("Default prompt templates seeded");
    } catch (seedError) {
      toast.error("Failed to seed defaults", {
        description: seedError instanceof Error ? seedError.message : String(seedError)
      });
    }
  }

  const currentTab = activeTab ?? orderedPrompts?.[0]?.imageType;

  return (
    <main className="page">
      <PageHeader
        eyebrow="Configuration"
        title="Prompts"
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => void seed()}>Seed</Button>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
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

      {orderedPrompts === undefined ? (
        <EmptyState loading title="Chargement des prompts" body="Lecture des templates depuis Convex." />
      ) : orderedPrompts.length === 0 ? (
        <EmptyState title="Aucun prompt" body="Seed les templates par defaut pour demarrer." />
      ) : (
        <Tabs value={currentTab} onValueChange={setActiveTab} className="grid gap-4 xl:grid-cols-[18rem_minmax(0,1fr)]">
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
                  prompt.isPreset ? " after:ml-auto after:size-1.5 after:rounded-full after:bg-primary after:content-['']" : ""
                }`}
              >
                <GripVertical className="size-3 shrink-0 opacity-50" />
                <span className="truncate">{prompt.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          {orderedPrompts.map((prompt) => (
            <TabsContent key={prompt._id} value={prompt.imageType}>
              <Card className="studio-card rounded-lg">
                <CardHeader className="flex flex-row items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-lg">{prompt.label}</CardTitle>
                    <p className="text-sm text-muted-foreground">{prompt.imageType}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Label className="flex h-8 cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 text-sm">
                      <Checkbox
                        checked={prompt.isPreset === true}
                        onCheckedChange={(checked) => void togglePreset(prompt._id, checked === true)}
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
                    onChange={(event) => setDrafts((current) => ({ ...current, [prompt._id]: event.target.value }))}
                  />
                  <div className="mt-3 flex justify-end gap-2">
                    <Button variant="outline" onClick={() => void reset(prompt._id)} disabled={busy === prompt._id}>
                      <BusyIcon busy={busy === prompt._id} />
                      {busy !== prompt._id ? <RotateCcw data-icon="inline-start" /> : null}
                      Reset
                    </Button>
                    <Button onClick={() => void save(prompt._id)} disabled={busy === prompt._id}>
                      <BusyIcon busy={busy === prompt._id} />
                      {busy !== prompt._id ? <Save data-icon="inline-start" /> : null}
                      Enregistrer
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      )}

      <CreatePromptDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        busy={busy === "create"}
        onCreate={(values) => void create(values)}
      />
    </main>
  );
}

function CreatePromptDialog({
  open,
  onOpenChange,
  busy,
  onCreate
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  onCreate: (values: { imageType: string; label: string; content: string }) => void;
}) {
  const [imageType, setImageType] = useState("");
  const [label, setLabel] = useState("");
  const [content, setContent] = useState("");

  useEffect(() => {
    if (open) {
      setImageType("");
      setLabel("");
      setContent("");
    }
  }, [open]);

  const canSubmit = imageType.trim() && label.trim() && content.trim() && !busy;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="border-white/10 bg-card sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nouveau template</DialogTitle>
          <DialogDescription>Creer un prompt personnalise. Le type d'image doit etre unique.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="prompt-image-type">Type image</Label>
            <Input
              id="prompt-image-type"
              placeholder="ex. detail-shot"
              value={imageType}
              onChange={(event) => setImageType(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="prompt-label">Label</Label>
            <Input
              id="prompt-label"
              placeholder="ex. Detail shot"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="prompt-content">Contenu</Label>
            <Textarea
              id="prompt-content"
              className="min-h-48 font-mono text-xs leading-relaxed"
              placeholder="Decrivez l'image a generer. Utilisez {{PRODUCT_TITLE}} si besoin."
              value={content}
              onChange={(event) => setContent(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button disabled={!canSubmit} onClick={() => onCreate({ imageType, label, content })}>
            <BusyIcon busy={busy} />
            {!busy ? <Plus data-icon="inline-start" /> : null}
            Creer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
