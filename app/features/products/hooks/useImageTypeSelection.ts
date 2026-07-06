import { useMemo, useState } from "react";

import type { Doc } from "@/lib/convex";

export function useImageTypeSelection(types: Doc<"promptTemplates">[]) {
  const defaultSelectedTypes = useMemo(() => {
    const presets = types.filter((type) => type.isPreset);
    const defaults = presets.length ? presets : types;
    return new Set(defaults.map((type) => type.imageType));
  }, [types]);
  const [selectedTypesOverride, setSelectedTypesOverride] =
    useState<Set<string> | null>(null);
  const selectedTypes = selectedTypesOverride ?? defaultSelectedTypes;

  function resetSelection() {
    setSelectedTypesOverride(null);
  }

  function toggleType(type: string) {
    setSelectedTypesOverride((current) => {
      const next = new Set(current ?? defaultSelectedTypes);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  return { selectedTypes, resetSelection, toggleType };
}
