import type { Doc } from "@/lib/convex";

export type JobBatchSegment = Doc<"generationBatchSegments">;
export type OpenAiBatchPhase = NonNullable<JobBatchSegment["phase"]>;

export type BatchJobProgress = {
  preparedTasks: number;
  submittedTasks: number;
  waitingTasks: number;
  recoveredTasks: number;
  totalTasks: number;
  segmentCount: number;
  completedSegments: number;
  preparing: boolean;
  submitting: boolean;
  waiting: boolean;
  recovering: boolean;
  uncertainCount: number;
  errors: { segmentId: string; label: string; error: string }[];
  batchSize?: number;
  concurrency?: number;
};

const phaseLabels: Record<OpenAiBatchPhase, string> = {
  preparing: "Préparation",
  uploading: "Envoi du fichier",
  submitting: "Soumission",
  uncertain: "Soumission à vérifier",
  waiting: "Attente OpenAI",
  recovering: "Récupération",
  completed: "Terminé",
  failed: "Échec",
};

export function batchSegmentPhaseLabel(segment: JobBatchSegment): string {
  return segment.phase ? phaseLabels[segment.phase] : segment.status;
}

function boundedCount(value: number | undefined, maximum: number): number {
  return Math.min(maximum, Math.max(0, value ?? 0));
}

export function createBatchJobProgress({
  job,
  images,
  segments,
}: {
  job: Doc<"generationJobs">;
  images: Doc<"generatedImages">[];
  segments: JobBatchSegment[];
}): BatchJobProgress | null {
  if (
    job.executionMode !== "batch" ||
    job.imageProvider === "gemini" ||
    (!job.openAiDurable && !segments.some((segment) => segment.phase))
  ) {
    return null;
  }

  const imagesBySegment = new Map<string, Doc<"generatedImages">[]>();
  for (const image of images) {
    if (!image.batchSegmentId) continue;
    const segmentImages = imagesBySegment.get(image.batchSegmentId) ?? [];
    segmentImages.push(image);
    imagesBySegment.set(image.batchSegmentId, segmentImages);
  }
  const activeSegments = segments.filter(
    (segment) =>
      segment.status !== "cancelled" &&
      (!imagesBySegment.size || imagesBySegment.has(segment._id)),
  );
  const taskCount = (segment: JobBatchSegment) => imagesBySegment.size
    ? Math.min(segment.imageCount, imagesBySegment.get(segment._id)?.length ?? 0)
    : segment.imageCount;
  const segmentTasks = activeSegments.reduce(
    (total, segment) => total + taskCount(segment),
    0,
  );
  // A retry only creates segments for unfinished tasks. Completed images from
  // earlier attempts remain part of every cumulative stage of this bulk.
  const preservedTasks = Math.min(
    job.completedTasks,
    Math.max(0, job.totalTasks - segmentTasks),
  );
  const progress: BatchJobProgress = {
    preparedTasks: preservedTasks,
    submittedTasks: preservedTasks,
    waitingTasks: 0,
    recoveredTasks: boundedCount(
      job.completedTasks + job.failedTasks,
      job.totalTasks,
    ),
    totalTasks: job.totalTasks,
    segmentCount: activeSegments.length,
    completedSegments: 0,
    preparing:
      !activeSegments.length &&
      (job.status === "queued" || job.status === "running"),
    submitting: false,
    waiting: false,
    recovering: false,
    uncertainCount: 0,
    errors: [],
    batchSize: job.openAiBatchSize,
    concurrency: job.openAiBatchConcurrency,
  };

  for (const segment of activeSegments) {
    const phase = segment.phase;
    const imageCount = taskCount(segment);
    const hasPreparedInput = Boolean(segment.batchId) ||
      phase === "uploading" ||
      phase === "submitting" ||
      phase === "uncertain" ||
      phase === "waiting" ||
      phase === "recovering" ||
      phase === "completed";
    progress.preparedTasks += hasPreparedInput
      ? imageCount
      : boundedCount(segment.preparedTasks, imageCount);
    if (segment.batchId) progress.submittedTasks += imageCount;
    if (phase === "preparing") progress.preparing = true;
    if (phase === "uploading" || phase === "submitting" || phase === "uncertain") {
      progress.submitting = true;
    }
    if (phase === "uncertain") progress.uncertainCount += 1;
    if (phase === "waiting") {
      progress.waiting = true;
      progress.waitingTasks += Math.max(
        0,
        imageCount - (segment.ingestedCount ?? 0) - (segment.failedCount ?? 0),
      );
    }
    if (phase === "recovering") progress.recovering = true;
    if (phase === "completed" || segment.status === "completed") {
      progress.completedSegments += 1;
    }
    const hasUnfinishedImages = (imagesBySegment.get(segment._id) ?? []).some(
      (image) => image.status !== "generated" && image.status !== "uploaded",
    );
    if (segment.error && (!imagesBySegment.size || hasUnfinishedImages)) {
      progress.errors.push({
        segmentId: segment._id,
        label: batchSegmentPhaseLabel(segment),
        error: segment.error,
      });
    }
  }

  progress.preparedTasks = boundedCount(progress.preparedTasks, job.totalTasks);
  progress.submittedTasks = boundedCount(progress.submittedTasks, job.totalTasks);
  progress.waitingTasks = boundedCount(progress.waitingTasks, job.totalTasks);
  if (job.status !== "queued" && job.status !== "running") {
    progress.preparing = false;
    progress.submitting = false;
    progress.waiting = false;
    progress.recovering = false;
  }
  return progress;
}
