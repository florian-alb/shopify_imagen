import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
  FieldError,
} from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { PromptConditionFields } from "./PromptConditionFields";
import type { ConditionalPromptDraft } from "../lib/conditionalPromptDraft";

export function PromptContentEditor({
  idPrefix,
  content,
  draft,
  onContentChange,
  onConditionalChange,
}: {
  idPrefix: string;
  content: string;
  draft: ConditionalPromptDraft;
  onContentChange: (value: string) => void;
  onConditionalChange: (draft: ConditionalPromptDraft) => void;
}) {
  return (
    <FieldGroup>
      <Field orientation="horizontal">
        <FieldLabel htmlFor={`${idPrefix}-conditional`}>
          Prompt conditionnel
        </FieldLabel>
        <Switch
          id={`${idPrefix}-conditional`}
          checked={draft.enabled}
          onCheckedChange={(enabled) =>
            onConditionalChange({ ...draft, enabled })
          }
        />
      </Field>
      {draft.enabled ? (
        <PromptConditionFields
          idPrefix={idPrefix}
          condition={draft.condition}
          onChange={(condition) => onConditionalChange({ ...draft, condition })}
        />
      ) : null}
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-content`}>
          {draft.enabled ? "Si la condition est vraie" : "Prompt spécifique"}
        </FieldLabel>
        <Textarea
          id={`${idPrefix}-content`}
          className="min-h-64 font-mono text-xs leading-relaxed"
          value={content}
          onChange={(event) => onContentChange(event.target.value)}
        />
      </Field>
      {draft.enabled ? (
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-otherwise`}>Sinon</FieldLabel>
          <Textarea
            id={`${idPrefix}-otherwise`}
            aria-invalid={!draft.alternativeContent.trim()}
            className="min-h-64 font-mono text-xs leading-relaxed"
            value={draft.alternativeContent}
            onChange={(event) =>
              onConditionalChange({
                ...draft,
                alternativeContent: event.target.value,
              })
            }
          />
          {!draft.alternativeContent.trim() ? (
            <FieldError>Le texte « Sinon » est requis.</FieldError>
          ) : null}
          <FieldDescription>
            Les deux textes sont requis. Le prompt maître et les paramètres
            ci-dessous s’appliquent à la branche choisie.
          </FieldDescription>
        </Field>
      ) : null}
    </FieldGroup>
  );
}
