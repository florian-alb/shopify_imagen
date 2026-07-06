import { ImageStateBadge } from "@/components/common/ImageStateBadge";
import type { Doc } from "@/lib/convex";
import { formatUsd } from "@/lib/formatters";
import { imageDisplayCost } from "../lib/jobDetailViewModel";

export function JobTechnicalDetails({
  images,
  job,
}: {
  images: Doc<"generatedImages">[];
  job: Doc<"generationJobs">;
}) {
  return (
    <details className="mt-5 rounded-lg border bg-background p-4">
      <summary className="cursor-pointer text-sm font-medium">
        Technical details
      </summary>
      <div className="mt-4 grid gap-2">
        {images.map((image) => (
          <div
            key={image._id}
            className="grid gap-2 rounded-lg border p-3 text-sm md:grid-cols-[1fr_auto] md:items-center"
          >
            <div className="min-w-0">
              <p className="font-medium">{image.imageType}</p>
              <p className="text-xs text-muted-foreground">
                {image.status} · Created{" "}
                {new Date(image.createdAt).toLocaleString()}
                {image.costUsd != null
                  ? ` · ${formatUsd(imageDisplayCost(image, job))} (${(
                      (image.inputTokens ?? 0) + (image.outputTokens ?? 0)
                    ).toLocaleString()} tok)`
                  : ""}
              </p>
              {image.providerBatchId ||
              image.providerRequestId ||
              image.providerResponseId ? (
                <dl className="mt-2 grid gap-1 text-xs text-muted-foreground">
                  {image.providerBatchId ? (
                    <div className="grid gap-1 md:grid-cols-[8rem_1fr]">
                      <dt>Batch ID</dt>
                      <dd className="truncate font-mono">
                        {image.providerBatchId}
                      </dd>
                    </div>
                  ) : null}
                  {image.providerRequestId ? (
                    <div className="grid gap-1 md:grid-cols-[8rem_1fr]">
                      <dt>Request ID</dt>
                      <dd className="truncate font-mono">
                        {image.providerRequestId}
                      </dd>
                    </div>
                  ) : null}
                  {image.providerResponseId ? (
                    <div className="grid gap-1 md:grid-cols-[8rem_1fr]">
                      <dt>Response ID</dt>
                      <dd className="truncate font-mono">
                        {image.providerResponseId}
                      </dd>
                    </div>
                  ) : null}
                </dl>
              ) : null}
              {image.error ? (
                <p className="mt-1 text-sm text-destructive">{image.error}</p>
              ) : null}
              {image.storageUrl ? (
                <a
                  className="mt-1 block truncate text-xs underline underline-offset-4"
                  href={image.storageUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {image.storageUrl}
                </a>
              ) : null}
            </div>
            <ImageStateBadge image={image} />
          </div>
        ))}
      </div>
    </details>
  );
}
