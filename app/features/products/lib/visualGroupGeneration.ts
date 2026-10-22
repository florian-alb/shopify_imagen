import type { VisualGroupWithRows } from "../types";

export function canGenerateVisualGroup(
  group: Pick<VisualGroupWithRows, "ready" | "references">,
  textOnly = false,
) {
  return textOnly || !group.references.length || group.ready;
}
