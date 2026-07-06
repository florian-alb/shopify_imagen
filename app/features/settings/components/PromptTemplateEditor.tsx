import { Save, Trash2 } from "lucide-react";
import { BusyIcon, StateBadge } from "@/components/page";
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
import { TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { type Doc, type Id } from "@/lib/convex";
import type { PromptTemplateEditorState } from "../hooks/usePromptTemplateDraftWorkflow";
import {
  promptKindBlankValue,
  promptKindOptions,
  type BackgroundDraft,
  type PromptAiDraft,
} from "../lib/promptTemplateDrafts";
import { BackgroundControls, PromptAiControls } from "./PromptControls";

export function PromptTemplateEditor({
  busy,
  editing,
  prompt,
  state,
  onCancelNameEdit,
  onChangeAi,
  onChangeBackground,
  onChangeContent,
  onChangeImageType,
  onChangePromptKind,
  onDelete,
  onSave,
  onStartNameEdit,
  onStopNameEdit,
  onTogglePreset,
}: {
  busy: string | null;
  editing: boolean;
  prompt: Doc<"promptTemplates">;
  state: PromptTemplateEditorState;
  onCancelNameEdit: (promptId: Id<"promptTemplates">) => void;
  onChangeAi: (
    prompt: Doc<"promptTemplates">,
    values: Partial<PromptAiDraft>,
  ) => void;
  onChangeBackground: (
    prompt: Doc<"promptTemplates">,
    values: Partial<BackgroundDraft>,
  ) => void;
  onChangeContent: (promptId: Id<"promptTemplates">, value: string) => void;
  onChangeImageType: (promptId: Id<"promptTemplates">, value: string) => void;
  onChangePromptKind: (promptId: Id<"promptTemplates">, value: string) => void;
  onDelete: (promptId: Id<"promptTemplates">) => void;
  onSave: (promptId: Id<"promptTemplates">) => void;
  onStartNameEdit: (promptId: Id<"promptTemplates">) => void;
  onStopNameEdit: () => void;
  onTogglePreset: (
    promptId: Id<"promptTemplates">,
    isPreset: boolean,
  ) => void;
}) {
  return (
    <TabsContent key={prompt._id} value={prompt.imageType}>
      <Card className="studio-card rounded-lg">
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            {editing ? (
              <Input
                aria-label="Nom du prompt"
                autoFocus
                className="h-10 text-lg"
                value={state.imageTypeValue}
                onBlur={onStopNameEdit}
                onChange={(event) =>
                  onChangeImageType(prompt._id, event.target.value)
                }
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    onCancelNameEdit(prompt._id);
                  }
                  if (event.key === "Enter" && state.canSaveChanges) {
                    event.currentTarget.blur();
                    onSave(prompt._id);
                  }
                }}
              />
            ) : (
              <CardTitle className="text-lg">
                <button
                  type="button"
                  className="text-left hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => onStartNameEdit(prompt._id)}
                >
                  {state.imageTypeValue.trim() || prompt.imageType}
                </button>
              </CardTitle>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Label className="flex h-8 cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 text-sm">
              <Checkbox
                checked={prompt.isPreset === true}
                onCheckedChange={(checked) =>
                  onTogglePreset(prompt._id, checked === true)
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
          <div className="grid gap-1.5">
            <Label htmlFor={`prompt-content-${prompt._id}`}>
              Prompt specifique
            </Label>
            <Textarea
              id={`prompt-content-${prompt._id}`}
              className="min-h-[28rem] max-h-96 font-mono text-xs leading-relaxed"
              value={state.contentValue}
              onChange={(event) =>
                onChangeContent(prompt._id, event.target.value)
              }
            />
          </div>
          <div className="mt-3 grid gap-1.5">
            <Label htmlFor={`prompt-kind-${prompt._id}`}>Prompt kind</Label>
            <Select
              value={state.promptKindValue || promptKindBlankValue}
              onValueChange={(selected) => {
                const nextPromptKind =
                  selected === promptKindBlankValue ? "" : selected;
                onChangePromptKind(prompt._id, nextPromptKind);
              }}
            >
              <SelectTrigger id={`prompt-kind-${prompt._id}`} className="w-full">
                <SelectValue placeholder="Type de prompt" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={promptKindBlankValue}>Defaut</SelectItem>
                {promptKindOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <PromptAiControls
            idPrefix={`prompt-ai-${prompt._id}`}
            draft={state.aiValue}
            onChange={(values) => onChangeAi(prompt, values)}
          />
          <BackgroundControls
            idPrefix={`prompt-background-${prompt._id}`}
            draft={state.backgroundValue}
            onChange={(values) => onChangeBackground(prompt, values)}
          />

          <div className="mt-3 flex justify-end gap-2">
            <Button
              variant="destructive"
              onClick={() => onDelete(prompt._id)}
              disabled={busy === prompt._id}
            >
              <Trash2 data-icon="inline-start" />
              Supprimer
            </Button>
            {state.hasChanges ? (
              <Button
                onClick={() => onSave(prompt._id)}
                disabled={busy === prompt._id || !state.canSaveChanges}
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
}
