import { config } from "../config.js";

let nextAllowedAt = 0;

function minimumIntervalMs(): number {
  const perMinute = Math.max(1, config.openaiImageRequestsPerMinute);
  return Math.ceil(60_000 / perMinute);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForImageRequestSlot(): Promise<void> {
  const now = Date.now();
  const waitMs = Math.max(0, nextAllowedAt - now);
  nextAllowedAt = Math.max(now, nextAllowedAt) + minimumIntervalMs();
  if (waitMs > 0) await sleep(waitMs);
}

export async function waitAfterRateLimit(errorMessage: string): Promise<boolean> {
  if (!/rate limit|try again/i.test(errorMessage)) return false;

  const match = errorMessage.match(/try again in\s+(\d+(?:\.\d+)?)s/i);
  const waitMs = match ? Math.ceil(Number(match[1]) * 1000) + 1000 : minimumIntervalMs();
  nextAllowedAt = Math.max(nextAllowedAt, Date.now() + waitMs);
  console.log(`OpenAI rate limit reached. Waiting ${Math.ceil(waitMs / 1000)}s before retrying.`);
  await sleep(waitMs);
  return true;
}
