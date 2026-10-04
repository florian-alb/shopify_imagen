import {
  Field,
  FieldLabel,
  FieldSet,
  FieldLegend,
  FieldDescription,
} from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { VariantSelection } from "../../../../convex/generationTargets";

export function VariantGenerationControls({
  value,
  onChange,
  allProductsSeparated,
  separatedProductCount,
}: {
  value: VariantSelection;
  onChange: (value: VariantSelection) => void;
  allProductsSeparated: boolean;
  separatedProductCount: number;
}) {
  if (allProductsSeparated)
    return (
      <p className="text-sm text-muted-foreground">
        Produits déjà séparés : une image par type sélectionné et par produit
        séparé, basée sur sa première variante Shopify.
      </p>
    );
  return (
    <FieldSet>
      <FieldLegend variant="label">Variantes à générer</FieldLegend>
      <RadioGroup
        value={value}
        onValueChange={(next: VariantSelection) => onChange(next)}
      >
        <Field orientation="horizontal">
          <RadioGroupItem id="variants-first" value="first" />
          <FieldLabel htmlFor="variants-first">
            Première variante uniquement
          </FieldLabel>
        </Field>
        <Field orientation="horizontal">
          <RadioGroupItem id="variants-all" value="all" />
          <FieldLabel htmlFor="variants-all">Toutes les variantes</FieldLabel>
        </Field>
      </RadioGroup>
      <FieldDescription>
        L’ordre suit Shopify, parmi les groupes sélectionnés. Chaque type
        d’image utilise le prompt de la variante correspondante.
      </FieldDescription>
      {separatedProductCount > 0 ? (
        <p className="text-xs text-muted-foreground">
          Les produits déjà séparés gardent une seule image par type et par
          produit séparé.
        </p>
      ) : null}
    </FieldSet>
  );
}
