import { describe, expect, it } from "vitest";
import type { Doc, Id } from "@/lib/convex";
import {
  batchSegmentPhaseLabel,
  createBatchJobProgress,
  type JobBatchSegment,
  type OpenAiBatchPhase,
} from "./batchJobProgress";

function job(overrides: Partial<Doc<"generationJobs">> = {}) {
  return {
    _id: "job" as Id<"generationJobs">,
    _creationTime: 1,
    createdAt: 1,
    updatedAt: 1,
    mode: "bulk",
    executionMode: "batch",
    imageProvider: "openai",
    status: "running",
    completedTasks: 0,
    failedTasks: 0,
    totalTasks: 900,
    openAiDurable: true,
    openAiBatchSize: 100,
    openAiBatchConcurrency: 2,
    ...overrides,
  } as Doc<"generationJobs">;
}

function segment(index: number, overrides: Partial<JobBatchSegment> = {}): JobBatchSegment {
  return {
    _id: `segment-${index}` as Id<"generationBatchSegments">,
    _creationTime: 1,
    jobId: "job" as Id<"generationJobs">,
    provider: "openai",
    status: "submitting",
    phase: "preparing",
    imageCount: 100,
    createdAt: index,
    updatedAt: 1,
    ...overrides,
  };
}

function imagesForSegment(
  batchSegmentId: Id<"generationBatchSegments">,
  count = 100,
  status: Doc<"generatedImages">["status"] = "generating",
): Doc<"generatedImages">[] {
  return Array.from({ length: count }, (_, index) => ({
    _id: `${batchSegmentId}-image-${index}` as Id<"generatedImages">,
    _creationTime: 1,
    createdAt: 1,
    updatedAt: 1,
    jobId: "job" as Id<"generationJobs">,
    productId: `product-${Math.floor(index / 3)}` as Id<"products">,
    imageType: `type-${index % 3}`,
    promptUsed: "prompt",
    batchSegmentId,
    status,
  }));
}

describe("durable OpenAI bulk progress", () => {
  it("shows simultaneous phases for 900 tasks without treating submission as completion", () => {
    const phases: OpenAiBatchPhase[] = [
      "completed", "completed", "recovering", "waiting", "uncertain",
      "submitting", "uploading", "preparing", "preparing",
    ];
    const segments = phases.map((phase, index) => segment(index, {
      phase,
      status: index < 2 ? "completed" : index < 4 ? "running" : "submitting",
      batchId: index < 4 ? `batch-${index}` : undefined,
      ingestedCount: index < 2 ? 100 : index === 2 ? 30 : 0,
      preparedTasks: index === 7 ? 50 : 0,
      error: index === 4 ? "Connection interrupted after submission" : undefined,
    }));
    const images = segments.flatMap((item, index) =>
      imagesForSegment(item._id, 100, index < 2 ? "generated" : "generating"),
    );
    const progress = createBatchJobProgress({
      job: job({ completedTasks: 230 }), images, segments,
    });

    expect(images).toHaveLength(900);
    expect(progress).toMatchObject({
      preparedTasks: 750,
      submittedTasks: 400,
      recoveredTasks: 230,
      waitingTasks: 100,
      totalTasks: 900,
      segmentCount: 9,
      completedSegments: 2,
      preparing: true,
      submitting: true,
      waiting: true,
      recovering: true,
      uncertainCount: 1,
      batchSize: 100,
      concurrency: 2,
    });
    expect(progress?.errors).toEqual([{
      segmentId: "segment-4", label: "Soumission à vérifier",
      error: "Connection interrupted after submission",
    }]);
  });

  it("retains completed results and ignores superseded segments during a retry", () => {
    const previous = segment(0, {
      phase: "failed", status: "failed", batchId: "batch-old",
      error: "50 tasks failed on previous attempt", imageCount: 900,
      ingestedCount: 850, failedCount: 50,
    });
    const retry = segment(1, { imageCount: 50, preparedTasks: 10 });
    const superseded = segment(2, {
      phase: "uncertain", status: "cancelled", imageCount: 50,
      error: "old attempt",
    });
    const images = [
      ...imagesForSegment(previous._id, 850, "generated"),
      ...imagesForSegment(retry._id, 50),
    ];
    const progress = createBatchJobProgress({
      job: job({ completedTasks: 850 }), images,
      segments: [previous, retry, superseded],
    });

    expect(progress).toMatchObject({
      preparedTasks: 860,
      submittedTasks: 850,
      recoveredTasks: 850,
      segmentCount: 2,
      uncertainCount: 0,
      errors: [],
    });
  });

  it("reconciles an uncertain acceptance from persisted segment state after reload", () => {
    const pending = segment(0, { phase: "uncertain" });
    const images = imagesForSegment(pending._id);
    const before = createBatchJobProgress({ job: job({ totalTasks: 100 }), images, segments: [pending] });
    const after = createBatchJobProgress({
      job: job({ totalTasks: 100 }), images,
      segments: [{ ...pending, phase: "waiting", status: "running", batchId: "accepted-batch" }],
    });

    expect(before).toMatchObject({ preparedTasks: 100, submittedTasks: 0, uncertainCount: 1 });
    expect(after).toMatchObject({ submittedTasks: 100, uncertainCount: 0, waitingTasks: 100 });
    expect(after?.recoveredTasks).toBe(0);
  });

  it("keeps progress bounded and stops active phase indicators for terminal jobs", () => {
    const item = segment(0, { preparedTasks: 999, phase: "recovering", batchId: "batch", imageCount: 100 });
    const progress = createBatchJobProgress({
      job: job({ totalTasks: 100, completedTasks: 110, failedTasks: 10, status: "completed" }),
      images: [], segments: [item],
    });

    expect(progress).toMatchObject({
      preparedTasks: 100, submittedTasks: 100, recoveredTasks: 100,
      preparing: false, submitting: false, waiting: false, recovering: false,
    });
  });

  it("shows preparation before segment creation and preserves old OpenAI and Gemini jobs", () => {
    const durableJob = job();
    expect(createBatchJobProgress({ job: durableJob, images: [], segments: [] }))
      .toMatchObject({ preparing: true, preparedTasks: 0, segmentCount: 0 });
    expect(createBatchJobProgress({
      job: { ...durableJob, openAiDurable: undefined }, images: [], segments: [],
    })).toBeNull();
    expect(createBatchJobProgress({
      job: job({ imageProvider: "gemini" }), images: [], segments: [segment(0)],
    })).toBeNull();
    expect(createBatchJobProgress({
      job: job({ executionMode: "realtime" }), images: [], segments: [segment(0)],
    })).toBeNull();
    expect(batchSegmentPhaseLabel(segment(0, { phase: undefined, status: "running" }))).toBe("running");
  });
});
