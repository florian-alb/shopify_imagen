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
import {
  normalizeReferenceImageCount,
  type BackgroundDraft,
  type BackgroundMode,
  type PromptAiDraft,
} from "../lib/promptTemplateDrafts";

export function PromptAiControls({
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

export function BackgroundControls({
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
