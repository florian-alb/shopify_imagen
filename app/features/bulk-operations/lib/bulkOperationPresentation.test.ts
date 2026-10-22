import { describe, expect, it } from "vitest";
import type { ListedBulkOperation } from "../types";
import { bulkOperationAction, progressLabel, resultSummary } from "./bulkOperationPresentation";
import { validateBulkOperationSearch } from "./bulkOperationSearch";

const ready = { status: "ready", operation: "flip_horizontal", issueItems: 0, details: {} } as Extract<ListedBulkOperation, { operation: "flip_horizontal" }>;

describe("bulk operation next action", () => {
  it("distinguishes preparation from publication", () => {
    expect(bulkOperationAction(ready)).toBe("Vérifier et publier");
    expect(resultSummary(ready)).toBe("Préparation terminée. Publication à confirmer.");
    expect(bulkOperationAction({ ...ready, status: "publishing" })).toBe("Suivre");
    expect(bulkOperationAction({ ...ready, status: "completed" })).toBe("Voir le bilan");
  });
  it("prioritizes the current restoration over the original result", () => {
    expect(bulkOperationAction({ ...ready, status: "completed", restoreStatus: "running" })).toBe("Suivre la restauration");
    expect(bulkOperationAction({ ...ready, status: "completed", restoreStatus: "partial" })).toBe("Examiner la restauration");
    expect(bulkOperationAction({ ...ready, status: "failed", restoreStatus: "completed" })).toBe("Voir le bilan");
  });
  it("directs errors to inspection and accepts only supported URL filters", () => {
    expect(bulkOperationAction({ ...ready, status: "partial", issueItems: 1 })).toBe("Examiner");
    expect(validateBulkOperationSearch({ operation: "reorder_media" })).toEqual({ operation: "reorder_media" });
    expect(validateBulkOperationSearch({ operation: "unknown", cursor: "untrusted" })).toEqual({ operation: undefined });
  });
  it("keeps the publication stage visible after a mirror operation completes", () => {
    expect(progressLabel({ ...ready, status: "completed", processedItems: 4, totalItems: 4 })).toBe("4/4 images publiées ou vérifiées");
    expect(progressLabel({ ...ready, processedItems: 4, totalItems: 4 })).toBe("4/4 images préparées ou vérifiées");
  });
});
