import type { ReactNode } from "react";
import { GripVertical, Plus } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type Doc, type Id } from "@/lib/convex";
import {
  newPromptTabValue,
  type NewPromptDraft,
} from "../lib/promptTemplateDrafts";

export function PromptTabs({
  children,
  currentTab,
  dragId,
  imageTypeDrafts,
  newPromptDraft,
  orderedPrompts,
  onCommitReorder,
  onReorderOver,
  onStartDrag,
  onTabChange,
}: {
  children: ReactNode;
  currentTab: string | undefined;
  dragId: Id<"promptTemplates"> | null;
  imageTypeDrafts: Record<string, string>;
  newPromptDraft: NewPromptDraft | null;
  orderedPrompts: Doc<"promptTemplates">[];
  onCommitReorder: () => void;
  onReorderOver: (promptId: Id<"promptTemplates">) => void;
  onStartDrag: (promptId: Id<"promptTemplates">) => void;
  onTabChange: (value: string) => void;
}) {
  return (
    <Tabs
      value={currentTab}
      onValueChange={onTabChange}
      className="grid gap-4 xl:grid-cols-[18rem_minmax(0,1fr)]"
    >
      <p className="text-xs text-muted-foreground xl:col-span-2">
        Glissez les templates pour definir l'ordre de publication Shopify.
      </p>
      <TabsList className="h-auto w-full max-w-full flex-wrap justify-start overflow-x-auto rounded-lg border border-white/10 bg-white/3 p-2 xl:flex xl:flex-col xl:items-stretch xl:self-start xl:overflow-visible">
        {orderedPrompts.map((prompt) => (
          <TabsTrigger
            key={prompt._id}
            value={prompt.imageType}
            draggable
            onDragStart={(event) => {
              onStartDrag(prompt._id);
              event.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              onReorderOver(prompt._id);
            }}
            onDrop={(event) => {
              event.preventDefault();
              onCommitReorder();
            }}
            onDragEnd={onCommitReorder}
            data-dragging={dragId === prompt._id ? "" : undefined}
            className={`min-h-10 w-full cursor-grab justify-start gap-2 rounded-md border border-transparent px-3 text-sm font-medium text-muted-foreground active:cursor-grabbing data-dragging:opacity-50 data-[state=active]:border-primary/30 data-[state=active]:bg-primary/15 data-[state=active]:text-foreground data-[state=inactive]:hover:bg-muted/70 data-[state=inactive]:hover:text-foreground${
              prompt.isPreset
                ? " after:ml-auto after:size-1.5 after:rounded-full after:bg-primary after:content-['']"
                : ""
            }`}
          >
            <GripVertical className="size-3 shrink-0 opacity-50" />
            <span className="truncate">
              {imageTypeDrafts[prompt._id]?.trim() || prompt.imageType}
            </span>
          </TabsTrigger>
        ))}

        {newPromptDraft ? (
          <TabsTrigger
            value={newPromptTabValue}
            className="min-h-10 w-full justify-start gap-2 rounded-md border border-primary/30 bg-primary/10 px-3 text-sm font-medium text-foreground data-[state=inactive]:hover:bg-primary/15"
          >
            <Plus className="size-3 shrink-0 opacity-70" />
            <span className="truncate">
              {newPromptDraft.imageType.trim() || "Nouveau template"}
            </span>
          </TabsTrigger>
        ) : null}
      </TabsList>

      {children}
    </Tabs>
  );
}
