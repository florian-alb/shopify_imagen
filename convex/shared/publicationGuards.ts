import type { Doc } from "../_generated/dataModel";
export function assertImageMutable(image: Doc<"generatedImages">) {
  if (image.pushRunId != null) {
    throw new Error("Cette image est en cours de publication Shopify. Attendez la fin de la publication avant de la modifier.");
  }
}
