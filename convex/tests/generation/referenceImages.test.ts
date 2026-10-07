// @vitest-environment node

import sharp from "sharp";
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import { buildGeminiReferenceParts } from "../../generation/gemini";
import { normalizeReferenceImage } from "../../generation/images";

const sourceUrl = "https://supplier.example/reference.png";
let image: Buffer;

beforeAll(async () => {
  image = await sharp({
    create: { width: 16, height: 8, channels: 4, background: "#00ff0080" },
  }).png().toBuffer();
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function imageResponse() {
  return new Response(new Uint8Array(image), {
    headers: { "content-type": "image/png" },
  });
}

describe("supplier reference image downloads", () => {
  test.each([408, 429, 500, 502, 503, 504])(
    "recovers from HTTP %s before normalizing the image",
    async (status) => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(new Response("temporary error", { status }))
        .mockResolvedValueOnce(imageResponse());
      vi.stubGlobal("fetch", fetchMock);

      const pending = normalizeReferenceImage(sourceUrl);
      await vi.runAllTimersAsync();
      const bytes = await pending;

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(await sharp(bytes).metadata()).toMatchObject({
        format: "jpeg", width: 16, height: 8, hasAlpha: false,
      });
    },
  );

  test("stops after three failed attempts and releases error response bodies", async () => {
    const fetchMock = vi.fn(() => {
      const response = new Response("bad gateway", { status: 502 });
      vi.spyOn(response.body!, "cancel");
      return Promise.resolve(response);
    });
    vi.stubGlobal("fetch", fetchMock);

    const assertion = expect(normalizeReferenceImage(sourceUrl)).rejects.toThrow(
      "Failed to download supplier reference image (502). Tried 3 times",
    );
    await vi.runAllTimersAsync();
    await assertion;

    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const result of fetchMock.mock.results) {
      expect((await result.value).body?.cancel).toHaveBeenCalledOnce();
    }
  });

  test.each([403, 404])("does not retry permanent HTTP %s errors", async (status) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(normalizeReferenceImage(sourceUrl)).rejects.toThrow(`(${status})`);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  test("retries a dropped connection", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(imageResponse());
    vi.stubGlobal("fetch", fetchMock);

    const pending = normalizeReferenceImage(sourceUrl);
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toBeInstanceOf(Buffer);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("retries a connection dropped while reading the response body", async () => {
    const response = imageResponse();
    vi.spyOn(response, "arrayBuffer").mockRejectedValueOnce(new TypeError("terminated"));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response)
      .mockResolvedValueOnce(imageResponse());
    vi.stubGlobal("fetch", fetchMock);

    const pending = normalizeReferenceImage(sourceUrl);
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toBeInstanceOf(Buffer);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("aborts a stalled response body and retries", async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce((_url: string, options: RequestInit) => {
        const response = imageResponse();
        vi.spyOn(response, "arrayBuffer").mockImplementation(() => new Promise((_, reject) => {
          options.signal!.addEventListener("abort", () => reject(new Error("aborted")));
        }));
        return Promise.resolve(response);
      })
      .mockResolvedValueOnce(imageResponse());
    vi.stubGlobal("fetch", fetchMock);

    const pending = normalizeReferenceImage(sourceUrl);
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toBeInstanceOf(Buffer);
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  test.each([
    ["4", 4000],
    ["3600", 10_000],
    ["invalid", 1000],
  ])("handles Retry-After %s with a bounded wait", async (retryAfter, delayMs) => {
    const start = Date.now();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, {
        status: 429, headers: { "retry-after": retryAfter },
      }))
      .mockImplementationOnce(() => {
        expect(Date.now() - start).toBe(delayMs);
        return Promise.resolve(imageResponse());
      });
    vi.stubGlobal("fetch", fetchMock);

    const pending = normalizeReferenceImage(sourceUrl);
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toBeInstanceOf(Buffer);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("does not retry image decoding errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("not an image"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(normalizeReferenceImage(sourceUrl)).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  test("rejects an oversized durable reference before reading its declared body", async () => {
    const response = new Response(new Uint8Array(image), { headers: { "content-length": "1025" } });
    const cancel = vi.spyOn(response.body!, "cancel");
    const fetchMock = vi.fn(async () => response);
    vi.stubGlobal("fetch", fetchMock);
    await expect(normalizeReferenceImage(sourceUrl, undefined, { maxBytes: 1024 })).rejects.toThrow("1024 byte download limit");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledOnce();
  });

  test("bounds streamed references even without Content-Length and does not retry size errors", async () => {
    const cancel = vi.fn();
    const response = new Response(new ReadableStream<Uint8Array>({
      pull(controller) { controller.enqueue(new Uint8Array(256)); }, cancel,
    }));
    const fetchMock = vi.fn(async () => response);
    vi.stubGlobal("fetch", fetchMock);
    await expect(normalizeReferenceImage(sourceUrl, undefined, { maxBytes: 512 })).rejects.toThrow("512 byte download limit");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledOnce();
  });

  test("bounds decoded durable reference pixels before normalization", async () => {
    const fetchMock = vi.fn(async () => imageResponse());
    vi.stubGlobal("fetch", fetchMock);
    await expect(normalizeReferenceImage(sourceUrl, undefined, { maxBytes: 1024, maxPixels: 100 })).rejects.toThrow("pixel limit");
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe("Gemini batch reference cache", () => {
  test("shares concurrent downloads and reuses successful normalized images", async () => {
    const fetchMock = vi.fn().mockResolvedValue(imageResponse());
    vi.stubGlobal("fetch", fetchMock);
    const cache = new Map<string, Promise<Buffer>>();

    const [first, second] = await Promise.all([
      buildGeminiReferenceParts([sourceUrl], cache),
      buildGeminiReferenceParts([sourceUrl], cache),
    ]);
    expect(first).toEqual(second);
    expect(first[0].inline_data.mime_type).toBe("image/jpeg");
    expect(await buildGeminiReferenceParts([sourceUrl], cache)).toEqual(first);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  test("lets later batch requests recover after a cached download exhausts its retries", async () => {
    const fetchMock = vi.fn()
      .mockImplementation(() => Promise.resolve(new Response(null, { status: 502 })));
    vi.stubGlobal("fetch", fetchMock);
    const cache = new Map<string, Promise<Buffer>>();

    const assertion = expect(Promise.all([
      buildGeminiReferenceParts([sourceUrl], cache),
      buildGeminiReferenceParts([sourceUrl], cache),
    ])).rejects.toThrow("(502)");
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(cache.has(sourceUrl)).toBe(false);

    fetchMock.mockResolvedValueOnce(imageResponse());
    const parts = await buildGeminiReferenceParts([sourceUrl], cache);
    expect(parts).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(cache.has(sourceUrl)).toBe(true);
  });
});
