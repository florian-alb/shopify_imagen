import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Active batch jobs schedule their own provider polls with adaptive backoff.
// This slower watchdog only recovers work if a scheduled poll was interrupted.
crons.interval(
  "poll image batches",
  { minutes: 15 },
  internal.generation.pollBatches,
  {},
);
crons.interval(
  "resume image post-processing",
  { minutes: 15 },
  internal.generation.processPostprocessingBacklog,
  {},
);
crons.interval(
  "cleanup stale rejected images",
  { hours: 1 },
  internal.shopify.cleanupStaleRejectedImages,
  {},
);
crons.interval(
  "cleanup stale OpenAI batch references",
  { hours: 12 },
  internal.generation.cleanupStaleOpenAiBatchReferences,
  {},
);
crons.interval(
  "resume stale bulk image transforms",
  { minutes: 15 },
  internal.bulkTransforms.resumeStaleJobs,
  {},
);
crons.interval(
  "resume stale bulk image reorders",
  { minutes: 15 },
  internal.bulkReorders.resumeStaleJobs,
  {},
);
crons.interval(
  "cleanup expired bulk image assets",
  { hours: 1 },
  internal.bulkTransformsNode.cleanupExpiredAssets,
  {},
);

export default crons;
