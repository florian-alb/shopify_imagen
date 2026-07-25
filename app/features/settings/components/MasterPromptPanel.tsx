import { ImageIcon, Save, Upload, X } from "lucide-react";
import { BusyIcon } from "@/components/page";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  modelReferenceBusyValue,
  modelReferenceKeys,
} from "../lib/promptTemplateDrafts";
import type { MasterPromptSettings } from "../hooks/usePromptTemplatesEditor";

type ModelReference =
  NonNullable<MasterPromptSettings>["modelReferences"][string];

export function ModelReferenceUploader({
  busy,
  reference,
  referenceKey,
  onDeleteReference,
  onUploadReference,
}: {
  busy: string | null;
  reference: ModelReference | undefined;
  referenceKey: string;
  onDeleteReference: (key: string) => void;
  onUploadReference: (key: string, file: File) => void;
}) {
  const referenceBusy = busy === modelReferenceBusyValue(referenceKey);
  const referenceDisabled = busy !== null;

  return (
    <div className="grid gap-2 rounded-md border border-border bg-background/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={`master-model-reference-${referenceKey}`}>
          {referenceKey}
        </Label>
        {reference?.url ? (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8"
            onClick={() => onDeleteReference(referenceKey)}
            disabled={referenceDisabled}
            aria-label={`Supprimer ${referenceKey}`}
          >
            <BusyIcon busy={referenceBusy} />
            {!referenceBusy ? <X className="size-4" /> : null}
          </Button>
        ) : null}
      </div>
      <div className="flex items-center gap-3">
        <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
          {reference?.url ? (
            <img
              src={reference.url}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <ImageIcon className="size-5 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm text-foreground">
            {reference?.fileName ?? "Aucun fichier"}
          </div>
          <Input
            id={`master-model-reference-${referenceKey}`}
            type="file"
            accept="image/*"
            className="mt-2 h-9 text-xs"
            disabled={referenceDisabled}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file) onUploadReference(referenceKey, file);
            }}
          />
        </div>
        {referenceBusy ? (
          <BusyIcon busy />
        ) : (
          <Upload className="size-4 shrink-0 text-muted-foreground" />
        )}
      </div>
    </div>
  );
}

export function MasterPromptPanel({
  busy,
  masterPrompt,
  masterPromptDirty,
  masterPromptValue,
  onChangeMasterPrompt,
  onDeleteReference,
  onSaveMasterPrompt,
  onUploadReference,
}: {
  busy: string | null;
  masterPrompt: MasterPromptSettings | undefined;
  masterPromptDirty: boolean;
  masterPromptValue: string;
  onChangeMasterPrompt: (value: string) => void;
  onDeleteReference: (key: string) => void;
  onSaveMasterPrompt: () => void;
  onUploadReference: (key: string, file: File) => void;
}) {
  return (
    <Accordion
      type="single"
      collapsible
      className="mb-4 rounded-lg border border-border bg-card/80 px-4"
    >
      <AccordionItem value="master-prompt" className="border-0">
        <AccordionTrigger className="py-4 hover:no-underline">
          <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-3 pr-2">
            <div className="text-left">
              <div className="text-base font-medium text-foreground">
                Master Prompt
              </div>
              <p className="mt-1 text-sm font-normal text-muted-foreground">
                Instructions communes optionnelles. Si le champ est vide, seuls
                les templates sont utilises.
              </p>
            </div>
          </div>
        </AccordionTrigger>
        <AccordionContent className="pb-4">
          {masterPrompt === undefined ? (
            <div className="flex min-h-32 items-center gap-2 text-sm text-muted-foreground">
              <BusyIcon busy />
              Chargement du master prompt.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Textarea
                className="max-h-[16rem] font-mono text-xs leading-relaxed"
                value={masterPromptValue}
                onChange={(event) => onChangeMasterPrompt(event.target.value)}
                placeholder="Laissez vide pour generer uniquement avec les templates."
              />
              <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {modelReferenceKeys.map((referenceKey) => (
                  <ModelReferenceUploader
                    key={referenceKey}
                    busy={busy}
                    reference={masterPrompt?.modelReferences[referenceKey]}
                    referenceKey={referenceKey}
                    onDeleteReference={onDeleteReference}
                    onUploadReference={onUploadReference}
                  />
                ))}
              </div>
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <Button
                  onClick={onSaveMasterPrompt}
                  disabled={busy !== null || !masterPromptDirty}
                >
                  <BusyIcon busy={busy === "master"} />
                  {busy !== "master" ? <Save data-icon="inline-start" /> : null}
                  Enregistrer
                </Button>
              </div>
            </div>
          )}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
