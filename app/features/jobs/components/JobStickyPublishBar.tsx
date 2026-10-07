import { Check, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BusyIcon } from "@/components/page";
import type { JobImagePublishRun } from "../hooks/useJobImagePublish";

export function JobStickyPublishBar({
  approvedCount,
  pendingCount,
  pushableCount,
  rejectedCount,
  reviewableCount,
  visibleReviewableCount,
  reviewing,
  publishing,
  publishRun,
  onPublish,
  onApproveVisible,
}: {
  approvedCount: number;
  pendingCount: number;
  pushableCount: number;
  rejectedCount: number;
  reviewableCount: number;
  visibleReviewableCount: number;
  reviewing: boolean;
  publishing: boolean;
  publishRun: JobImagePublishRun | null | undefined;
  onPublish: () => void;
  onApproveVisible: () => void;
}) {
  if (!reviewableCount) return null;

  return (
    <div className="sticky-actions">
      <Card
        size="sm"
        className="flex-row items-center justify-between gap-3 rounded-lg p-3 shadow-2xl"
      >
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {approvedCount} approuvees · {pendingCount} a verifier ·{" "}
            {rejectedCount} rejetees
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {publishRun?.status === "running"
              ? `Publication en arrière-plan · ${publishRun.processedProducts} / ${publishRun.totalProducts} produits`
              : pushableCount
              ? `${pushableCount} image${pushableCount === 1 ? "" : "s"} prete${
                  pushableCount === 1 ? "" : "s"
                } a publier`
              : "Aucune nouvelle image a publier"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={!visibleReviewableCount || reviewing}
            onClick={onApproveVisible}
          >
            <Check data-icon="inline-start" />
            Approver {visibleReviewableCount || ""}
          </Button>
          <Button disabled={publishing || !pushableCount} onClick={onPublish}>
            <BusyIcon busy={publishing && publishRun !== undefined} />
            {!publishing ? <Send data-icon="inline-start" /> : null}
            {publishing && publishRun !== undefined ? "Publication…" : `Publier ${pushableCount || ""}`}
          </Button>
        </div>
      </Card>
    </div>
  );
}
