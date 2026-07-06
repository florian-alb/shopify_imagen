import { Plus } from "lucide-react";
import { BusyIcon } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  newPromptTabValue,
  promptKindBlankValue,
  promptKindOptions,
  type NewPromptDraft,
  type PromptAiDraft,
} from "../lib/promptTemplateDrafts";
import { BackgroundControls, PromptAiControls } from "./PromptControls";

export function NewPromptTemplateEditor({
  busy,
  canCreatePrompt,
  newPromptDraft,
  newPromptAiValue,
  onCancel,
  onCreate,
  onUpdateAiDraft,
  onUpdateDraft,
}: {
  busy: string | null;
  canCreatePrompt: boolean;
  newPromptDraft: NewPromptDraft;
  newPromptAiValue: PromptAiDraft;
  onCancel: () => void;
  onCreate: () => void;
  onUpdateAiDraft: (values: Partial<PromptAiDraft>) => void;
  onUpdateDraft: (values: Partial<NewPromptDraft>) => void;
}) {
  return (
    <TabsContent value={newPromptTabValue} className="min-w-0">
      <Card className="rounded-lg">
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
                  onUpdateDraft({
                    imageType: event.target.value,
                  })
                }
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="new-prompt-kind">Prompt kind</Label>
              <Select
                value={newPromptDraft.promptKind || promptKindBlankValue}
                onValueChange={(selected) =>
                  onUpdateDraft({
                    promptKind:
                      selected === promptKindBlankValue ? "" : selected,
                  })
                }
              >
                <SelectTrigger id="new-prompt-kind" className="w-full">
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
          </div>
          <div className="mt-3 grid gap-1.5">
            <Label htmlFor="prompt-content">Prompt specifique</Label>
            <Textarea
              id="prompt-content"
              className="min-h-[28rem] font-mono text-xs leading-relaxed"
              placeholder="Decrivez l'image a generer. Utilisez {{PRODUCT_TITLE}} si besoin."
              value={newPromptDraft.content}
              onChange={(event) =>
                onUpdateDraft({ content: event.target.value })
              }
            />
          </div>
          <PromptAiControls
            idPrefix="new-prompt-ai"
            draft={newPromptAiValue}
            onChange={onUpdateAiDraft}
          />
          <BackgroundControls
            idPrefix="new-prompt-background"
            draft={newPromptDraft}
            onChange={onUpdateDraft}
          />
          <div className="sticky bottom-0 -mx-4 mt-3 flex justify-end gap-2 border-t border-border bg-card/95 px-4 py-3 backdrop-blur">
            <Button
              variant="outline"
              onClick={onCancel}
              disabled={busy === "create"}
            >
              Annuler
            </Button>
            <Button onClick={onCreate} disabled={!canCreatePrompt}>
              <BusyIcon busy={busy === "create"} />
              {busy !== "create" ? <Plus data-icon="inline-start" /> : null}
              Creer
            </Button>
          </div>
        </CardContent>
      </Card>
    </TabsContent>
  );
}
