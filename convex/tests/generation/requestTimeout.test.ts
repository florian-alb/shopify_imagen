// @vitest-environment node

import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Doc } from "../../_generated/dataModel";
import { submitGeminiBatch } from "../../generation/geminiBatchClient";
import { submitOpenAiBatch } from "../../generation/openAiBatch";
import { ensureProductVibe } from "../../generation/vibe";
import { withRequestTimeout } from "../../generation/requestTimeout";

vi.mock("../../generation/images", () => ({
  normalizeReferenceImage: vi.fn(async () => Buffer.from("reference")),
}));
vi.mock("../../generation/storage", () => ({
  uploadToR2: vi.fn(async () => "https://r2.example/reference.jpg"),
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("GEMINI_API_KEY", "test");
  vi.stubEnv("OPENAI_API_KEY", "test");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function stall(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
  });
}

const image = { _id: "image", promptUsed: "Prompt", sourceImageUrl: "https://supplier.example/image.jpg" } as Doc<"generatedImages">;

test.each(["gemini", "openai"])("aborts a stalled %s file upload instead of waiting for Convex to kill the action", async (provider) => {
  const fetchMock = vi.fn((_url, options: RequestInit) => stall(options.signal!));
  vi.stubGlobal("fetch", fetchMock);
  const submit = provider === "gemini" ? submitGeminiBatch : submitOpenAiBatch;
  const assertion = expect(submit({ images: [image], settings: {}, model: "test" })).rejects.toThrow("batch submission timed out after 180 seconds");
  await vi.advanceTimersByTimeAsync(180_000);
  await assertion;
  expect(fetchMock).toHaveBeenCalledOnce();
  expect(fetchMock.mock.calls[0][1].signal?.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

test("keeps the submission deadline active after response headers arrive", async () => {
  vi.stubGlobal("fetch", vi.fn((_url, options: RequestInit) => {
    const response = new Response("{}");
    vi.spyOn(response, "json").mockImplementation(() => stall(options.signal!));
    return Promise.resolve(response);
  }));
  const assertion = expect(submitOpenAiBatch({ images: [image], settings: {}, model: "test" })).rejects.toThrow("timed out after 180 seconds");
  await vi.advanceTimersByTimeAsync(180_000);
  await assertion;
  expect(vi.getTimerCount()).toBe(0);
});

test("a stalled vibe analysis falls back after 30 seconds so batch submission can proceed", async () => {
  vi.stubGlobal("fetch", vi.fn((_url, options: RequestInit) => stall(options.signal!)));
  const runMutation = vi.fn();
  const pending = ensureProductVibe({ runMutation }, {} as Doc<"products">, image.sourceImageUrl, {}, true);
  await vi.advanceTimersByTimeAsync(30_000);
  await expect(pending).resolves.toBe("");
  expect(runMutation).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

test("preserves the OpenAI JSONL request and clears the deadline on successful submission", async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(Response.json({ id: "file_input" }))
    .mockResolvedValueOnce(Response.json({ id: "batch_test", status: "validating" }));
  vi.stubGlobal("fetch", fetchMock);
  await expect(submitOpenAiBatch({ images: [image], settings: {}, model: "test" }))
    .resolves.toMatchObject({ batchId: "batch_test", batchStatus: "validating" });
  const form = fetchMock.mock.calls[0][1].body as FormData;
  const line = JSON.parse(await (form.get("file") as Blob).text());
  expect(line).toMatchObject({
    custom_id: image._id, method: "POST", url: "/v1/images/edits",
    body: { prompt: image.promptUsed, images: [{ image_url: "https://r2.example/reference.jpg" }] },
  });
  expect(line).not.toHaveProperty("signal");
  expect(vi.getTimerCount()).toBe(0);
});

test("stops sibling IO when concurrent preparation fails before the deadline", async () => {
  let signal: AbortSignal | undefined;
  await expect(withRequestTimeout("Submission", 180_000, async (activeSignal) => {
    signal = activeSignal;
    throw new Error("Invalid reference");
  })).rejects.toThrow("Invalid reference");
  expect(signal?.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});
