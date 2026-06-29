import type { BatchIngestCounts } from "./batchTypes";

export type TerminalBatchResult =
  | { state: "busy" }
  | { state: "failed"; error: string }
  | { state: "cancelled" }
  | ({ state: "partial" } & BatchIngestCounts)
  | ({ state: "done" } & BatchIngestCounts);

export type ManualPollResult =
  | { state: "pending"; batchStatus?: string | null }
  | TerminalBatchResult;

export type PollBatchOptions = {
  attempt?: number;
  schedulePending?: boolean;
  schedulePartial?: boolean;
  throwPollErrors?: boolean;
};

export const BATCH_SUBMISSION_STUCK_MS = 10 * 60 * 1000;
const BATCH_POLL_BACKOFF_MS = [10_000, 20_000, 45_000, 120_000] as const;

export function batchPollDelayMs(attempt: number): number {
  const index = Math.max(
    0,
    Math.min(Math.floor(attempt), BATCH_POLL_BACKOFF_MS.length - 1),
  );
  return BATCH_POLL_BACKOFF_MS[index];
}

export function isCancellableBatchStatus(
  provider: "gemini" | "openai",
  status: string | null | undefined,
) {
  if (!status) return true;
  if (provider === "openai")
    return ["validating", "in_progress", "finalizing"].includes(status);
  return [
    "JOB_STATE_PENDING",
    "BATCH_STATE_PENDING",
    "JOB_STATE_RUNNING",
    "BATCH_STATE_RUNNING",
    "PENDING",
    "RUNNING",
  ].includes(status);
}
