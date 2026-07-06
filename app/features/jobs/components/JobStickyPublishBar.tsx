import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function JobStickyPublishBar({
  approvedCount,
  pendingCount,
  pushableCount,
  rejectedCount,
  reviewableCount,
  onPublish,
}: {
  approvedCount: number;
  pendingCount: number;
  pushableCount: number;
  rejectedCount: number;
  reviewableCount: number;
  onPublish: () => void;
}) {
  if (!reviewableCount) return null;

  return (
    <div className="sticky-actions">
      <Card
        size="sm"
        className="studio-card flex-row items-center justify-between gap-3 rounded-lg p-3 shadow-2xl"
      >
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {approvedCount} approuvees · {pendingCount} a verifier ·{" "}
            {rejectedCount} rejetees
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {pushableCount
              ? `${pushableCount} image${pushableCount === 1 ? "" : "s"} prete${
                  pushableCount === 1 ? "" : "s"
                } a publier`
              : "Aucune nouvelle image a publier"}
          </p>
        </div>
        <Button disabled={!pushableCount} onClick={onPublish}>
          <Send data-icon="inline-start" />
          Publier {pushableCount || ""}
        </Button>
      </Card>
    </div>
  );
}
