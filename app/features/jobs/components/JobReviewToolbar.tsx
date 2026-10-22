import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { Doc } from "@/lib/convex";
import {
  executionModeLabel,
  reviewFilters,
  type ReviewFilter,
  type JobReviewCounts,
} from "../lib/jobDetailViewModel";

export function JobReviewToolbar({
  counts,
  executionMode,
  filter,
  images,
  onFilterChange,
}: {
  counts: JobReviewCounts;
  executionMode?: "realtime" | "batch";
  filter: ReviewFilter;
  images: Doc<"generatedImages">[];
  reviewing: boolean;
  visibleReviewableCount: number;
  onApproveVisible: () => void;
  onFilterChange: (filter: ReviewFilter) => void;
}) {
  return (
    <section className="mb-4 rounded-lg border bg-card p-4">
      <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-1 text-xs text-muted-foreground">
            {executionModeLabel(executionMode)} · Vérification
          </p>
          <h2 className="text-xl font-semibold">Vérifier les images</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Approuvez les images à publier. Les images rejetées restent disponibles comme références.
          </p>
        </div>
      </div>
      <div className="sm:hidden">
        <Select value={filter} onValueChange={value => onFilterChange(value as ReviewFilter)}>
          <SelectTrigger className="h-11 w-full" aria-label="Filtrer les images du lot"><SelectValue /></SelectTrigger>
          <SelectContent>{reviewFilters.map(item => <SelectItem key={item.value} value={item.value}>{item.label} · {item.value === "all" ? images.length : counts[item.value]}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="hidden flex-wrap gap-2 sm:flex">
        {reviewFilters.map((item) => {
          const count =
            item.value === "all"
              ? images.length
              : item.value === "pending"
                ? counts.pending
                : item.value === "approved"
                  ? counts.approved
                  : item.value === "rejected"
                    ? counts.rejected
                    : item.value === "failed"
                      ? counts.failed
                      : item.value === "pushing"
                        ? counts.pushing
                      : counts.pushed;

          return (
            <Button
              aria-pressed={filter === item.value}
              key={item.value}
              variant={filter === item.value ? "default" : "outline"}
              size="sm"
              onClick={() => onFilterChange(item.value)}
            >
              {item.label} {count}
            </Button>
          );
        })}
      </div>
    </section>
  );
}
