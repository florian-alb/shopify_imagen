import { StateBadge } from "@/components/page";
import {
  generatedImageStateLabel,
  generatedImageStateTone,
} from "@/features/images/lib/state";
import type { Doc } from "@/lib/convex";

export function ImageStateBadge({
  image,
}: {
  image: Doc<"generatedImages">;
}) {
  return (
    <StateBadge state={generatedImageStateTone(image)}>
      {generatedImageStateLabel(image)}
    </StateBadge>
  );
}
