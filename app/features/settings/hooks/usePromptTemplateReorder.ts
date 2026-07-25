import { useState } from "react";
import { toast } from "sonner";
import type { Doc, Id } from "@/lib/convex";
import type { usePromptTemplatesEditor } from "./usePromptTemplatesEditor";

type PromptTemplatesEditor = ReturnType<typeof usePromptTemplatesEditor>;

function orderMatches(
  prompts: Doc<"promptTemplates">[] | undefined,
  localOrder: Id<"promptTemplates">[] | null,
) {
  if (!prompts || !localOrder) return false;
  const serverOrder = prompts.map((prompt) => prompt._id);
  return (
    serverOrder.length === localOrder.length &&
    serverOrder.every((id, index) => id === localOrder[index])
  );
}

export function usePromptTemplateReorder({
  prompts,
  reorderPrompts,
}: {
  prompts: Doc<"promptTemplates">[] | undefined;
  reorderPrompts: PromptTemplatesEditor["reorderPrompts"];
}) {
  const [dragId, setDragId] = useState<Id<"promptTemplates"> | null>(null);
  const [localOrder, setLocalOrder] = useState<Id<"promptTemplates">[] | null>(
    null,
  );
  const activeLocalOrder = orderMatches(prompts, localOrder) ? null : localOrder;
  const orderedPrompts =
    activeLocalOrder && prompts
      ? (activeLocalOrder
          .map((id) => prompts.find((prompt) => prompt._id === id))
          .filter(Boolean) as Doc<"promptTemplates">[])
      : prompts;

  function reorderOver(overId: Id<"promptTemplates">) {
    if (!dragId || dragId === overId || !orderedPrompts) return;
    const ids = orderedPrompts.map((prompt) => prompt._id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(overId);
    if (from === -1 || to === -1) return;
    ids.splice(from, 1);
    ids.splice(to, 0, dragId);
    setLocalOrder(ids);
  }

  async function commitReorder() {
    // onDrop and onDragEnd both fire on successful drop; only first should save.
    if (!dragId) return;
    const ids = orderedPrompts?.map((prompt) => prompt._id);
    setDragId(null);
    if (!ids || !activeLocalOrder) return;
    try {
      await reorderPrompts({ orderedIds: ids });
      toast.success("Prompt order saved");
    } catch (reorderError) {
      setLocalOrder(null);
      toast.error("Failed reorder prompts", {
        description:
          reorderError instanceof Error
            ? reorderError.message
            : String(reorderError),
      });
    }
  }

  function removeFromLocalOrder(promptId: Id<"promptTemplates">) {
    setLocalOrder((current) =>
      current ? current.filter((id) => id !== promptId) : current,
    );
  }

  return {
    dragId,
    orderedPrompts,
    commitReorder,
    removeFromLocalOrder,
    reorderOver,
    startDrag: setDragId,
  };
}
