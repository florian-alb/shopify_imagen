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
        className="flex-col items-stretch justify-between gap-3 rounded-lg p-3 sm:flex-row sm:items-center"
      >
        <div className="min-w-0">
          <p className="hidden text-sm font-medium sm:block">
            {approvedCount} approuvées · {pendingCount} à vérifier ·{" "}
            {rejectedCount} rejetées dans ce lot
          </p>
          <p className="text-xs text-muted-foreground">
            {publishRun?.status === "running"
              ? `Publication en arrière-plan · ${publishRun.processedProducts} / ${publishRun.totalProducts} produits`
              : pushableCount
              ? `${pushableCount} image${pushableCount === 1 ? "" : "s"} prête${
                  pushableCount === 1 ? "" : "s"
                } à publier dans le lot, quel que soit le filtre`
              : "Aucune nouvelle image à publier"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 max-sm:[&>button]:min-h-11 max-sm:[&>button]:flex-1">
          <Button
            variant="secondary"
            aria-label={`Approuver ${visibleReviewableCount} images dans cette vue`}
            disabled={!visibleReviewableCount || reviewing}
            onClick={onApproveVisible}
          >
            <Check data-icon="inline-start" />
            Approuver {visibleReviewableCount || ""}<span className="hidden sm:inline"> dans cette vue</span>
          </Button>
          <Button aria-label={`Publier ${pushableCount} images du lot`} disabled={publishing || !pushableCount} onClick={onPublish}>
            <BusyIcon busy={publishing && publishRun !== undefined} />
            {!publishing ? <Send data-icon="inline-start" /> : null}
            {publishing && publishRun !== undefined ? "Publication…" : <>Publier {pushableCount || ""}<span className="hidden sm:inline"> du lot</span></>}
          </Button>
        </div>
      </Card>
    </div>
  );
}
