import { Input } from "@/components/ui/input";
import {
  Field,
  FieldLabel,
  FieldSet,
  FieldLegend,
  FieldDescription,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PromptCondition } from "../../../../convex/promptConditions";

export function PromptConditionFields({
  idPrefix,
  condition,
  onChange,
}: {
  idPrefix: string;
  condition: PromptCondition;
  onChange: (condition: PromptCondition) => void;
}) {
  function changeCondition(values: Partial<PromptCondition>) {
    onChange({ ...condition, ...values });
  }
  return (
    <FieldSet className="rounded-lg border p-3">
      <FieldLegend variant="label">Condition</FieldLegend>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-field`}>Donnée à vérifier</FieldLabel>
        <Select
          value={condition.field}
          onValueChange={(field: PromptCondition["field"]) =>
            changeCondition({ field })
          }
        >
          <SelectTrigger id={`${idPrefix}-field`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="product_title">Nom du produit</SelectItem>
              <SelectItem value="variant_title">Nom de la variante</SelectItem>
              <SelectItem value="option_value">Valeur d’une option</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      {condition.field === "option_value" ? (
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-option`}>
            Nom de l’option
          </FieldLabel>
          <Input
            id={`${idPrefix}-option`}
            aria-invalid={!condition.optionName?.trim()}
            placeholder="Taille, Size, Couleur…"
            value={condition.optionName ?? ""}
            onChange={(event) =>
              changeCondition({ optionName: event.target.value })
            }
          />
        </Field>
      ) : null}
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-operator`}>Comparaison</FieldLabel>
        <Select
          value={condition.operator}
          onValueChange={(operator: PromptCondition["operator"]) =>
            changeCondition({ operator })
          }
        >
          <SelectTrigger id={`${idPrefix}-operator`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="present">Est renseigné</SelectItem>
              <SelectItem value="contains">Contient</SelectItem>
              <SelectItem value="equals">Est égal à</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      {condition.operator !== "present" ? (
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-value`}>
            Valeur à rechercher
          </FieldLabel>
          <Input
            id={`${idPrefix}-value`}
            aria-invalid={!condition.value?.trim()}
            placeholder="ex. cm"
            value={condition.value ?? ""}
            onChange={(event) => changeCondition({ value: event.target.value })}
          />
        </Field>
      ) : null}
      <FieldDescription>
        Évaluée pour chaque variante générée, sans distinction de casse ni
        d’accents. Une donnée absente utilise « Sinon ».
      </FieldDescription>
    </FieldSet>
  );
}
