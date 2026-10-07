// The timer covers response bodies and all preparation performed by the caller.
// Abort the actual IO instead of leaving work running behind Promise.race.
export async function withRequestTimeout<T>(
  label: string,
  timeoutMs: number,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await run(controller.signal);
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)} seconds.`);
    }
    throw error;
  } finally {
    // A concurrent preparation task can fail before its siblings finish.
    // Stop their IO too when the caller unwinds early.
    controller.abort();
    clearTimeout(timer);
  }
}
