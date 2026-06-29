export function env(name: string, fallback = "") {
  return process.env[name] ?? fallback;
}

export function intEnv(name: string, fallback: number) {
  const parsed = Number.parseInt(env(name), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Structured, greppable logging for the generation pipeline. Shows up in
// Convex logs / dashboard so generations can be traced end to end.
export function log(
  scope: string,
  message: string,
  data?: Record<string, unknown>,
) {
  const suffix =
    data && Object.keys(data).length ? ` ${JSON.stringify(data)}` : "";
  console.log(`[gen:${scope}] ${message}${suffix}`);
}

export function waitFromRateLimitMessage(message: string, minimumMs: number) {
  const match = message.match(
    /(?:try|retry)(?:\s+again)?\s+in\s+(\d+(?:\.\d+)?)s/i,
  );
  return match ? Math.ceil(Number(match[1]) * 1000) + 1250 : minimumMs;
}
