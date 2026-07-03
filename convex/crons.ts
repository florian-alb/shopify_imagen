import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Batch image jobs are asynchronous: this poll checks every pending provider
// batch, retrieves finished images, and completes the job once results arrive.
crons.interval("poll image batches", { minutes: 2 }, internal.generation.pollBatches, {});
crons.interval(
  "resume image post-processing",
  { minutes: 1 },
  internal.generation.processPostprocessingBacklog,
  {},
);
crons.interval(
  "cleanup stale rejected images",
  { hours: 1 },
  internal.shopify.cleanupStaleRejectedImages,
  {},
);

export default crons;
