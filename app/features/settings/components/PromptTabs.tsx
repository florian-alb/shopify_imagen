import type { ReactNode } from "react";
import { GripVertical, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  onCreateTemplate,
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
  onCreateTemplate: () => void;
}) {
  return (
    <Tabs
      orientation="vertical"
      value={currentTab}
      onValueChange={onTabChange}
      className="grid min-w-0 gap-4 xl:grid-cols-[18rem_minmax(0,1fr)] xl:items-start"
    >
      <div className="flex items-center justify-between gap-3 xl:col-span-2">
        <p className="text-xs text-muted-foreground">
          Glissez les templates pour definir l'ordre de publication Shopify.
        </p>
        <Button size="sm" onClick={onCreateTemplate}>
          <Plus data-icon="inline-start" />
          Template
        </Button>
      </div>
      <TabsList className="flex h-auto w-full min-w-0 max-w-full flex-col items-stretch justify-start gap-1 overflow-visible rounded-lg border border-border bg-card p-2 xl:self-start">
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
            className={`h-auto min-h-10 w-full flex-none cursor-grab justify-start gap-2 rounded-md border border-transparent px-3 py-2 text-left text-sm font-medium text-muted-foreground after:hidden active:cursor-grabbing data-dragging:opacity-50 data-[state=active]:border-primary/30 data-[state=active]:bg-primary/15 data-[state=active]:text-foreground data-[state=inactive]:hover:bg-muted/70 data-[state=inactive]:hover:text-foreground${
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
            className="h-auto min-h-10 w-full flex-none justify-start gap-2 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-left text-sm font-medium text-foreground after:hidden data-[state=inactive]:hover:bg-primary/15"
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
