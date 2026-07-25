import type { Dispatch, SetStateAction } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export function PublishImagesOptions({
  hasVisualGroups,
  replaceExisting,
  setReplaceExisting,
  replaceVariantMedia,
  setReplaceVariantMedia,
}: {
  hasVisualGroups: boolean;
  replaceExisting: boolean;
  setReplaceExisting: Dispatch<SetStateAction<boolean>>;
  replaceVariantMedia: boolean;
  setReplaceVariantMedia: Dispatch<SetStateAction<boolean>>;
}) {
  const galleryForcesVariantReplacement = replaceExisting;

  return (
    <div className="grid gap-2">
      {hasVisualGroups ? (
        <Label className="flex items-start gap-3 rounded-lg border p-3">
          <Checkbox
            className="mt-0.5"
            checked={replaceVariantMedia || galleryForcesVariantReplacement}
            disabled={galleryForcesVariantReplacement}
            onCheckedChange={(checked) =>
              setReplaceVariantMedia(checked === true)
            }
          />
          <span className="grid gap-0.5">
            <span className="text-sm font-medium">
              Remplacer les images des variantes
            </span>
            <span className="text-xs font-normal text-muted-foreground">
              {galleryForcesVariantReplacement
                ? "Requis lorsque la galerie Shopify existante est remplacée."
                : replaceVariantMedia
                  ? "La première image publiée de chaque groupe devient l’image de ses variantes."
                  : "Les variantes qui ont déjà une image ne seront pas modifiées."}
            </span>
          </span>
        </Label>
      ) : null}

      <Label className="flex items-start gap-3 rounded-lg border p-3">
        <Checkbox
          className="mt-0.5"
          checked={replaceExisting}
          onCheckedChange={(checked) => {
            const shouldReplace = checked === true;
            setReplaceExisting(shouldReplace);
            if (shouldReplace) setReplaceVariantMedia(true);
          }}
        />
        <span className="grid gap-0.5">
          <span className="text-sm font-medium">
            Remplacer la galerie Shopify après l’envoi
          </span>
          <span className="text-xs font-normal text-muted-foreground">
            Supprime les anciennes images une fois les nouvelles publiées.
          </span>
        </span>
      </Label>
    </div>
  );
}
