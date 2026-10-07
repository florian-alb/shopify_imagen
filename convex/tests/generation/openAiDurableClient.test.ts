// @vitest-environment node

import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  createOpenAiBatchFromFile,
  durableOpenAiReferenceKey,
  findOpenAiBatchBySubmissionKey,
  getOpenAiBatchState,
  ingestOpenAiBatchFilePage,
  openAiBatchInputJsonl,
  OpenAiBatchRejectedError,
  OpenAiBatchSubmissionUncertainError,
  prepareOpenAiBatchReferences,
  uploadOpenAiBatchInput,
} from "../../generation/openAiDurableClient";
import { normalizeReferenceImage } from "../../generation/images";
import { uploadToR2 } from "../../generation/storage";
import { pollOpenAiBatch } from "../../generation/openAiBatch";

vi.mock("../../generation/images", () => ({ normalizeReferenceImage: vi.fn(async () => Buffer.from("reference")) }));
vi.mock("../../generation/storage", () => ({ uploadToR2: vi.fn() }));

beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "test-only");
  vi.stubEnv("R2_PUBLIC_BASE_URL", "https://r2.example");
  vi.mocked(uploadToR2).mockImplementation(async ({ key }) => `https://r2.example/${key}`);
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

function row(imageId: string) {
  return JSON.stringify({ custom_id: imageId, response: { status_code: 200, body: { data: [{ b64_json: Buffer.from(`image-${imageId}`).toString("base64") }], usage: { input_tokens: 3, output_tokens: 7 } } } });
}

test("missing credentials fail before dispatch and permit a safe corrected retry", async () => {
  vi.stubEnv("OPENAI_API_KEY", "");
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await expect(createOpenAiBatchFromFile({ inputFileId: "input", submissionKey: "submission" }))
    .rejects.toBeInstanceOf(OpenAiBatchRejectedError);
  expect(fetch).not.toHaveBeenCalled();
});

function streamedResponse(bytes: Uint8Array, status = 200, headers: Record<string, string> = {}, chunkSize = 37) {
  let index = 0;
  const cancelled = vi.fn();
  const response = new Response(new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index === bytes.length) { controller.close(); return; }
      const end = Math.min(index + chunkSize, bytes.length);
      controller.enqueue(bytes.slice(index, end));
      index = end;
    },
    cancel: cancelled,
  }), { status, headers });
  vi.spyOn(response, "text").mockImplementation(() => { throw new Error("Whole-file reads are forbidden."); });
  return { response, cancelled };
}

test("prepares 300 product references once for their 900 image requests", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));
  const allImages = [];
  for (let product = 0; product < 300; product++) {
    const sourceUrl = `https://supplier.example/${product}.jpg`;
    const prepared = await prepareOpenAiBatchReferences({ referenceKey: `job-product-${product}`, sourceUrls: [sourceUrl, sourceUrl, sourceUrl] });
    for (let image = 0; image < 3; image++) {
      allImages.push({ _id: `${product}-${image}`, promptUsed: "Rideau français", stagedReferenceUrls: prepared.map((entry) => entry.url) });
    }
  }
  expect(normalizeReferenceImage).toHaveBeenCalledTimes(300);
  expect(uploadToR2).toHaveBeenCalledTimes(300);
  const requests = [];
  for (let start = 0; start < allImages.length; start += 100) {
    const jsonl = openAiBatchInputJsonl({ images: allImages.slice(start, start + 100), settings: {}, model: "gpt-image-2.5-sunburst" });
    expect(Buffer.byteLength(jsonl)).toBeLessThan(100_000);
    requests.push(...jsonl.trim().split("\n").map((line) => JSON.parse(line)));
  }
  expect(requests).toHaveLength(900);
  expect(new Set(requests.map((request) => request.custom_id)).size).toBe(900);
  expect(requests[0].body.images).toEqual(requests[1].body.images);
});

test("recovers a reference uploaded before its database acknowledgement without downloading it again", async () => {
  const uploaded = new Set<string>();
  vi.stubGlobal("fetch", vi.fn(async (url) => new Response(null, { status: uploaded.has(String(url)) ? 200 : 404 })));
  vi.mocked(uploadToR2).mockImplementation(async ({ key }) => {
    const url = `https://r2.example/${key}`;
    uploaded.add(url);
    return url;
  });
  const args = { referenceKey: "job-product", sourceUrls: ["https://supplier.example/ref.jpg"] };
  await expect(prepareOpenAiBatchReferences({ ...args, onPrepared: async () => { throw new Error("Interrupted before commit"); } })).rejects.toThrow("Interrupted before commit");
  const onPrepared = vi.fn(async () => {});
  const restored = await prepareOpenAiBatchReferences({ ...args, onPrepared });
  expect(normalizeReferenceImage).toHaveBeenCalledOnce();
  expect(uploadToR2).toHaveBeenCalledOnce();
  expect(onPrepared).toHaveBeenCalledWith(restored[0]);
  expect(restored[0].url).toContain(durableOpenAiReferenceKey(args.referenceKey, args.sourceUrls[0]));
});

test("persists each reference before preparing the next and reuses committed references", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));
  const committed: Array<{ sourceUrl: string; url: string }> = [];
  const sources = ["https://supplier.example/1.jpg", "https://supplier.example/2.jpg"];
  await expect(prepareOpenAiBatchReferences({ referenceKey: "job-product", sourceUrls: sources, onPrepared: async (pair) => {
    committed.push(pair);
    throw new Error("Interrupted");
  } })).rejects.toThrow("Interrupted");
  expect(normalizeReferenceImage).toHaveBeenCalledOnce();
  await prepareOpenAiBatchReferences({ referenceKey: "job-product", sourceUrls: sources, existing: committed });
  expect(normalizeReferenceImage).toHaveBeenCalledTimes(2);
});

test("uploads only bounded JSONL input and rejects duplicate ids and oversized segments", async () => {
  const fetchMock = vi.fn(async (_url: string, _options: RequestInit) => Response.json({ id: "file_input" }));
  vi.stubGlobal("fetch", fetchMock);
  const input = { images: [{ _id: "image", promptUsed: "Prompt", stagedReferenceUrls: ["https://r2.example/reference.jpg"] }], settings: {}, model: "test", submissionKey: "job-segment-attempt" };
  await expect(uploadOpenAiBatchInput(input)).resolves.toEqual({ inputFileId: "file_input" });
  const form = fetchMock.mock.calls[0][1].body as FormData;
  expect(form.get("purpose")).toBe("batch");
  expect(JSON.parse(await (form.get("file") as Blob).text())).toMatchObject({ custom_id: "image", body: { images: [{ image_url: "https://r2.example/reference.jpg" }] } });
  expect(() => openAiBatchInputJsonl({ ...input, images: [...input.images, ...input.images] })).toThrow("duplicate image id");
  expect(() => openAiBatchInputJsonl({ ...input, images: [{ ...input.images[0], promptUsed: "x".repeat(8 * 1024 * 1024) }] })).toThrow("8 MiB");
});

test("a lost batch creation response becomes uncertain and reconciliation never submits another batch", async () => {
  const fetchMock = vi.fn()
    .mockRejectedValueOnce(new Error("Socket closed after acceptance"))
    .mockResolvedValueOnce(Response.json({ data: [{ id: "batch_accepted", input_file_id: "file_input", status: "in_progress", metadata: { submission_key: "submission-1" } }], has_more: false }));
  vi.stubGlobal("fetch", fetchMock);
  await expect(createOpenAiBatchFromFile({ inputFileId: "file_input", submissionKey: "submission-1" })).rejects.toBeInstanceOf(OpenAiBatchSubmissionUncertainError);
  expect(fetchMock).toHaveBeenCalledOnce();
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ input_file_id: "file_input", metadata: { submission_key: "submission-1" } });
  const reconciled = await findOpenAiBatchBySubmissionKey({ submissionKey: "submission-1" });
  expect(reconciled).toEqual({ matches: [{ batchId: "batch_accepted", batchStatus: "in_progress", inputFileId: "file_input" }], cursor: null, exhausted: true });
  expect(fetchMock.mock.calls.filter((call) => call[1]?.method === "POST")).toHaveLength(1);
});

test("reconciliation pages stay bounded and report conflicting batch matches explicitly", async () => {
  vi.stubGlobal("fetch", vi.fn()
    .mockResolvedValueOnce(Response.json({ data: [{ id: "batch_1", metadata: { submission_key: "same" } }, { id: "batch_2", metadata: { submission_key: "same" } }], has_more: true, last_id: "batch_2" }))
    .mockResolvedValueOnce(Response.json({ data: [], has_more: false })));
  const first = await findOpenAiBatchBySubmissionKey({ submissionKey: "same" });
  expect(first.matches).toHaveLength(2);
  expect(first.exhausted).toBe(false);
  expect(first.cursor).toBe("batch_2");
  expect(await findOpenAiBatchBySubmissionKey({ submissionKey: "same", cursor: first.cursor })).toMatchObject({ matches: [], exhausted: true });
});

test("operator reconciliation finds batches by submission key or input file across all pages", async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(Response.json({
      data: [
        { id: "key-match", input_file_id: "other-file", metadata: { submission_key: "expected-key" }, status: "in_progress" },
        { id: "file-match", input_file_id: "expected-file", metadata: {}, status: "validating" },
        { id: "unrelated", input_file_id: "other-file", metadata: { submission_key: "other-key" } },
      ],
      has_more: true,
      last_id: "unrelated",
    }))
    .mockResolvedValueOnce(Response.json({
      data: [{ id: "both-match", input_file_id: "expected-file", metadata: { submission_key: "expected-key" }, status: "completed" }],
      has_more: false,
    }));
  vi.stubGlobal("fetch", fetchMock);
  const result = await findOpenAiBatchBySubmissionKey({ submissionKey: "expected-key", inputFileId: "expected-file", maxPages: 2 });
  expect(result).toEqual({
    matches: [
      { batchId: "key-match", batchStatus: "in_progress", inputFileId: "other-file" },
      { batchId: "file-match", batchStatus: "validating", inputFileId: "expected-file" },
      { batchId: "both-match", batchStatus: "completed", inputFileId: "expected-file" },
    ],
    cursor: null,
    exhausted: true,
  });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock.mock.calls[1][0]).toContain("after=unrelated");
  expect(fetchMock.mock.calls.every((call) => call[1]?.method !== "POST")).toBe(true);
});

test("ordinary reconciliation requires the submission key when no input-file fallback was requested", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({
    data: [{ id: "same-file-without-key", input_file_id: "expected-file", metadata: {} }],
    has_more: false,
  })));
  expect(await findOpenAiBatchBySubmissionKey({ submissionKey: "expected-key" })).toEqual({
    matches: [], cursor: null, exhausted: true,
  });
});

test.each([408, 503])("HTTP %s during creation is uncertain instead of automatically retried", async (status) => {
  const fetchMock = vi.fn(async () => Response.json({ error: { message: "Upstream unavailable" } }, { status }));
  vi.stubGlobal("fetch", fetchMock);
  await expect(createOpenAiBatchFromFile({ inputFileId: "file", submissionKey: "key" })).rejects.toBeInstanceOf(OpenAiBatchSubmissionUncertainError);
  expect(fetchMock).toHaveBeenCalledOnce();
});

test.each([400, 401, 403, 404, 422, 429])("HTTP %s is an explicit rejection safe to fail without reconciliation", async (status) => {
  const fetchMock = vi.fn(async () => Response.json({ error: { message: "Rejected" } }, { status }));
  vi.stubGlobal("fetch", fetchMock);
  await expect(createOpenAiBatchFromFile({ inputFileId: "file", submissionKey: "key" })).rejects.toBeInstanceOf(OpenAiBatchRejectedError);
  expect(fetchMock).toHaveBeenCalledOnce();
});

test("a creation deadline abort is uncertain and never issues a second POST", async () => {
  vi.useFakeTimers();
  const fetchMock = vi.fn((_url: string, options: RequestInit) => new Promise<Response>((_resolve, reject) => {
    options.signal!.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
  }));
  vi.stubGlobal("fetch", fetchMock);
  const assertion = expect(createOpenAiBatchFromFile({ inputFileId: "file", submissionKey: "key" })).rejects.toBeInstanceOf(OpenAiBatchSubmissionUncertainError);
  await vi.advanceTimersByTimeAsync(60_000);
  await assertion;
  expect(fetchMock).toHaveBeenCalledOnce();
  expect(fetchMock.mock.calls[0][1].signal!.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

test("a batch terminal failure preserves its partial output and error file ids", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ status: "expired", output_file_id: "partial", error_file_id: "errors", errors: { data: [{ message: "Quota exceeded" }] } })));
  await expect(getOpenAiBatchState("batch")).resolves.toEqual({ batchStatus: "expired", inputFileId: null, metadata: null,
    outputFileId: "partial", errorFileId: "errors", error: "Quota exceeded" });
});

test("existing expired OpenAI jobs recover partial files without loading their output into memory", async () => {
  const fetchMock = vi.fn(async () => Response.json({ status: "expired", output_file_id: "partial", error_file_id: "errors" }));
  vi.stubGlobal("fetch", fetchMock);
  await expect(pollOpenAiBatch("legacy", {})).resolves.toMatchObject({
    state: "done", batchStatus: "expired", source: { kind: "openai-file", outputFileId: "partial", errorFileId: "errors" },
  });
  expect(fetchMock).toHaveBeenCalledOnce();
});

test("streams 900 result rows with exact resumable UTF-8 byte cursors and no whole-file read", async () => {
  const bytes = Buffer.from(`${Array.from({ length: 900 }, (_, index) => row(`français-${index}`)).join("\r\n")}\r\n`);
  const responses: Response[] = [];
  const fetchMock = vi.fn(async (_url, options: RequestInit) => {
    const offset = Number(/^bytes=(\d+)-$/.exec((options.headers as Record<string, string>).Range ?? "")?.[1] ?? 0);
    if (offset === bytes.length) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${bytes.length}` } });
    const { response } = streamedResponse(bytes.subarray(offset), offset ? 206 : 200, offset ? { "Content-Range": `bytes ${offset}-${bytes.length - 1}/${bytes.length}` } : {});
    responses.push(response);
    return response;
  });
  vi.stubGlobal("fetch", fetchMock);
  let byteOffset = 0;
  let active = 0;
  const results: string[] = [];
  let done = false;
  while (!done) {
    const page = await ingestOpenAiBatchFilePage({ fileId: "results", byteOffset, settings: {}, maxItems: 25, onItem: async (imageId, item, nextOffset) => {
      active++;
      expect(active).toBe(1);
      expect(item.bytes?.toString()).toBe(`image-${imageId}`);
      await Promise.resolve();
      byteOffset = nextOffset;
      results.push(imageId);
      active--;
    } });
    byteOffset = page.byteOffset;
    done = page.done;
  }
  expect(results).toHaveLength(900);
  expect(new Set(results).size).toBe(900);
  expect(byteOffset).toBe(bytes.length);
  expect(fetchMock).toHaveBeenCalledTimes(37);
  for (const response of responses) expect(response.text).not.toHaveBeenCalled();
});

test("an interruption after item storage replays one row safely and streams past a server ignoring Range", async () => {
  const bytes = Buffer.from(`${row("1")}\n${row("2")}\n${row("3")}`);
  const cancellations: Array<ReturnType<typeof vi.fn>> = [];
  vi.stubGlobal("fetch", vi.fn(async () => {
    const stream = streamedResponse(bytes, 200, {}, 11);
    cancellations.push(stream.cancelled);
    return stream.response;
  }));
  const stored = new Set<string>();
  let cursor = 0;
  let once = true;
  await expect(ingestOpenAiBatchFilePage({ fileId: "results", byteOffset: cursor, settings: {}, onItem: async (id, _item, nextOffset) => {
    stored.add(id);
    if (id === "2" && once) { once = false; throw new Error("Interrupted after storage"); }
    cursor = nextOffset;
  } })).rejects.toThrow("Interrupted after storage");
  expect(stored).toEqual(new Set(["1", "2"]));
  const replayed: string[] = [];
  const next = await ingestOpenAiBatchFilePage({ fileId: "results", byteOffset: cursor, settings: {}, maxItems: 10, onItem: async (id, _item, nextOffset) => {
    replayed.push(id);
    stored.add(id);
    cursor = nextOffset;
  } });
  expect(replayed).toEqual(["2", "3"]);
  expect(stored.size).toBe(3);
  expect(next).toMatchObject({ byteOffset: bytes.length, done: true });
  expect(cancellations[0]).toHaveBeenCalled();
});

test("rejects oversized output rows before decoding and leaves the durable cursor unchanged", async () => {
  const bytes = Buffer.from(`${JSON.stringify({ custom_id: "large", response: { body: { data: [{ b64_json: "a".repeat(2048) }] } } })}\n`);
  const stream = streamedResponse(bytes, 200, {}, 256);
  vi.stubGlobal("fetch", vi.fn(async () => stream.response));
  const onItem = vi.fn(async () => {});
  await expect(ingestOpenAiBatchFilePage({ fileId: "results", byteOffset: 0, settings: {}, maxLineBytes: 1024, onItem })).rejects.toThrow("row exceeds 1024 bytes");
  expect(onItem).not.toHaveBeenCalled();
  expect(stream.cancelled).toHaveBeenCalled();
});

test("rejects a mismatched byte range instead of losing results", async () => {
  const stream = streamedResponse(Buffer.from(`${row("1")}\n`), 206, { "Content-Range": "bytes 0-10/11" });
  vi.stubGlobal("fetch", vi.fn(async () => stream.response));
  const onItem = vi.fn(async () => {});
  await expect(ingestOpenAiBatchFilePage({ fileId: "results", byteOffset: 10, settings: {}, onItem })).rejects.toThrow("inconsistent Content-Range");
  expect(onItem).not.toHaveBeenCalled();
});
