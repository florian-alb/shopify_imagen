import { WandSparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { useQuery } from "convex/react";

import { BusyIcon } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { api, type Doc } from "@/lib/convex";

import type { ProductListItem } from "../types";

export function ImageTypeSelectionDialog({
  open,
  products,
  submitting,
  onOpenChange,
  onGenerate,
}: {
  open: boolean;
  products: ProductListItem[];
  submitting: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerate: (imageTypes: string[]) => void;
}) {
  const prompts = useQuery(api.prompts.list) as
    | Doc<"promptTemplates">[]
    | undefined;
  const types = useMemo(
    () => (prompts ?? []).filter((prompt) => prompt.isActive),
    [prompts],
  );
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [touched, setTouched] = useState(false);
  const defaultSelected = useMemo(() => {
    const presets = types.filter((type) => type.isPreset);
    const defaults = presets.length ? presets : types;
    return new Set(defaults.map((type) => type.imageType));
  }, [types]);
  const selectedTypes = touched ? (selected ?? new Set()) : defaultSelected;

  function toggle(type: string) {
    setTouched(true);
    setSelected((current) => {
      const next = new Set(current ?? defaultSelected);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-white/10 bg-card sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Types d'images</DialogTitle>
          <DialogDescription>
            {products.length} produit{products.length === 1 ? "" : "s"}{" "}
            selectionne{products.length === 1 ? "" : "s"}. Chaque type utilise
            son prompt actif.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          {types.map((type) => (
            <Label
              key={type.imageType}
              className="flex min-h-11 justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3"
            >
              <span>{type.label}</span>
              <Checkbox
                checked={selectedTypes.has(type.imageType)}
                onCheckedChange={() => toggle(type.imageType)}
              />
            </Label>
          ))}
        </div>
        <DialogFooter>
          <Button
            disabled={!selectedTypes.size || submitting}
            onClick={() => onGenerate(Array.from(selectedTypes))}
          >
            <BusyIcon busy={submitting} />
            {!submitting ? <WandSparkles data-icon="inline-start" /> : null}
            Lancer le job
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
