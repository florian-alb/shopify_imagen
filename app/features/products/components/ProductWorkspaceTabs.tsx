import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ProductView } from "../lib/productWorkspaceSearch";

export function ProductWorkspaceTabs({ view, onViewChange, images, references, history, information }: {
  view: ProductView;
  onViewChange: (view: ProductView) => void;
  images: ReactNode;
  references: ReactNode;
  history: ReactNode;
  information: ReactNode;
}) {
  const panels = [
    { value: "images", label: "Images", content: images },
    { value: "references", label: "Références et déclinaisons", content: references },
    { value: "history", label: "Historique", content: history },
    { value: "information", label: "Informations", content: information },
  ] as const;
  return <Tabs value={view} onValueChange={value => onViewChange(value as ProductView)} className="gap-3">
    <div className="max-w-full overflow-x-auto pb-1">
      <TabsList className="h-11 w-max" aria-label="Espace produit">
        {panels.map(panel => <TabsTrigger key={panel.value} value={panel.value} aria-label={panel.label} className="px-2 text-xs sm:px-3 sm:text-sm">
          {panel.value === "references" ? <>Références<span className="hidden sm:inline"> et déclinaisons</span></> : panel.label}
        </TabsTrigger>)}
      </TabsList>
    </div>
    {panels.map(panel => <TabsContent key={panel.value} value={panel.value} forceMount hidden={view !== panel.value}
      className="min-w-0 space-y-4 data-[state=inactive]:hidden">{panel.content}</TabsContent>)}
  </Tabs>;
}
