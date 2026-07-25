import { LayoutGrid } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Id } from "@/lib/convex";
import { cn } from "@/lib/utils";

import type { VisualProductViewModel } from "../lib/visualProductWorkspace";
import { visualProductStatusLabels } from "../lib/visualProductWorkspace";

const OVERVIEW_VALUE = "overview";

export function VisualProductWorkspace({
  visualProducts,
  activeGroupId,
  children,
  onSelect,
}: {
  visualProducts: VisualProductViewModel[];
  activeGroupId: Id<"visualGroups"> | null;
  children: ReactNode;
  onSelect: (groupId: Id<"visualGroups"> | null) => void;
}) {
  const publishedCount = visualProducts.filter(
    (item) => item.member || item.uploadedCount > 0,
  ).length;

  return (
    <section
      className="overflow-hidden rounded-xl border bg-background"
      aria-label="Produit et déclinaisons"
    >
      <div className="border-b p-3 lg:hidden">
        <label
          htmlFor="visual-product-mobile-navigation"
          className="mb-1.5 block text-xs font-medium text-muted-foreground"
        >
          Espace affiché
        </label>
        <Select
          value={activeGroupId ?? OVERVIEW_VALUE}
          onValueChange={(value) =>
            onSelect(
              value === OVERVIEW_VALUE ? null : (value as Id<"visualGroups">),
            )
          }
        >
          <SelectTrigger
            id="visual-product-mobile-navigation"
            className="h-11 w-full"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={OVERVIEW_VALUE}>Vue d’ensemble</SelectItem>
            {visualProducts.map((item) => (
              <SelectItem key={item.group._id} value={item.group._id}>
                {item.group.label} · {visualProductStatusLabels[item.status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="lg:grid lg:min-h-[38rem] lg:grid-cols-[15rem_minmax(0,1fr)]">
        <VisualProductNavigation
          visualProducts={visualProducts}
          activeGroupId={activeGroupId}
          publishedCount={publishedCount}
          onSelect={onSelect}
        />
        <div className="min-w-0 space-y-4 p-4 sm:p-5">{children}</div>
      </div>
    </section>
  );
}

function VisualProductNavigation({
  visualProducts,
  activeGroupId,
  publishedCount,
  onSelect,
}: {
  visualProducts: VisualProductViewModel[];
  activeGroupId: Id<"visualGroups"> | null;
  publishedCount: number;
  onSelect: (groupId: Id<"visualGroups"> | null) => void;
}) {
  return (
    <aside className="hidden border-r bg-muted/20 p-3 lg:block">
      <button
        type="button"
        className={cn(
          "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
          activeGroupId === null && "bg-muted",
        )}
        aria-current={activeGroupId === null ? "page" : undefined}
        onClick={() => onSelect(null)}
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-md bg-background ring-1 ring-border">
          <LayoutGrid className="size-4" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-medium">Vue d’ensemble</span>
          <span className="block text-xs text-muted-foreground">
            {publishedCount}/{visualProducts.length} publiées
          </span>
        </span>
      </button>

      <div className="mb-2 mt-5 flex items-center justify-between px-3">
        <p className="text-xs font-medium text-muted-foreground">
          Déclinaisons
        </p>
        <Badge variant="outline">{visualProducts.length}</Badge>
      </div>

      <nav aria-label="Déclinaisons du produit" className="grid gap-1">
        {visualProducts.map((item) => {
          const selected = activeGroupId === item.group._id;
          return (
            <button
              key={item.group._id}
              type="button"
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                selected && "bg-muted",
              )}
              aria-current={selected ? "page" : undefined}
              onClick={() => onSelect(item.group._id)}
            >
              <span
                className="size-5 shrink-0 rounded-full border"
                style={{
                  background: item.group.swatchCss ?? "var(--muted)",
                }}
                aria-hidden="true"
              />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">
                  {item.group.label}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {visualProductStatusLabels[item.status]}
                </span>
              </span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
