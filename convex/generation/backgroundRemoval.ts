import { env, intEnv, sleep } from "./runtime";

type FalQueueResponse = {
  request_id?: string;
  status?: string;
  status_url?: string;
  response_url?: string;
  error?: { message?: string } | string;
  detail?: unknown;
  image?: { url?: string };
};

type DownloadBinary = (
  url: string,
) => Promise<{ bytes: Buffer; contentType: string }>;

export class BackgroundRemovalError extends Error {
  requestId: string | null;

  constructor(message: string, requestId: string | null = null) {
    super(message);
    this.requestId = requestId;
  }
}

function falPayloadError(payload: FalQueueResponse | null) {
  if (!payload) return "unknown error";
  if (typeof payload.error === "string") return payload.error;
  if (payload.error?.message) return payload.error.message;
  if (typeof payload.detail === "string") return payload.detail;
  return "unknown error";
}

export async function removeBackgroundWithFal(
  imageUrl: string,
  downloadBinary: DownloadBinary,
) {
  const apiKey = env("FAL_KEY");
  if (!apiKey) throw new Error("FAL_KEY is required for background removal.");

  const submit = await fetch(
    "https://queue.fal.run/fal-ai/ideogram/remove-background",
    {
      method: "POST",
      headers: {
        Authorization: `Key ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ image_url: imageUrl }),
    },
  );
  const submitted = (await submit
    .json()
    .catch(() => null)) as FalQueueResponse | null;
  const requestId = submitted?.request_id ?? null;
  if (!submit.ok) {
    throw new BackgroundRemovalError(
      `fal background removal submit failed (${submit.status}): ${falPayloadError(submitted)}`,
      requestId,
    );
  }

  const statusUrl = submitted?.status_url;
  let responseUrl = submitted?.response_url;
  if (!statusUrl || !responseUrl) {
    throw new BackgroundRemovalError(
      "fal background removal submit returned no status_url or response_url.",
      requestId,
    );
  }

  const maxPolls = intEnv("FAL_BACKGROUND_REMOVAL_MAX_POLLS", 120);
  const pollIntervalMs = intEnv(
    "FAL_BACKGROUND_REMOVAL_POLL_INTERVAL_MS",
    1000,
  );
  let completed = false;
  for (let attempt = 0; attempt < maxPolls; attempt += 1) {
    const statusResponse = await fetch(statusUrl, {
      headers: { Authorization: `Key ${apiKey}` },
    });
    const statusPayload = (await statusResponse
      .json()
      .catch(() => null)) as FalQueueResponse | null;
    if (!statusResponse.ok) {
      throw new BackgroundRemovalError(
        `fal background removal status failed (${statusResponse.status}): ${falPayloadError(statusPayload)}`,
        requestId,
      );
    }

    responseUrl = statusPayload?.response_url ?? responseUrl;
    const status = statusPayload?.status ?? "";
    if (status === "COMPLETED") {
      completed = true;
      break;
    }
    if (
      status === "FAILED" ||
      status === "CANCELLED" ||
      status === "CANCELED"
    ) {
      throw new BackgroundRemovalError(
        `fal background removal ${status.toLowerCase()}: ${falPayloadError(statusPayload)}`,
        requestId,
      );
    }
    await sleep(pollIntervalMs);
  }
  if (!completed) {
    throw new BackgroundRemovalError(
      "fal background removal timed out before completion.",
      requestId,
    );
  }

  const response = await fetch(responseUrl, {
    headers: { Authorization: `Key ${apiKey}` },
  });
  const output = (await response
    .json()
    .catch(() => null)) as FalQueueResponse | null;
  if (!response.ok) {
    throw new BackgroundRemovalError(
      `fal background removal response failed (${response.status}): ${falPayloadError(output)}`,
      requestId,
    );
  }
  const outputUrl = output?.image?.url;
  if (!outputUrl) {
    throw new BackgroundRemovalError(
      "fal background removal returned no output image URL.",
      requestId,
    );
  }

  const transparent = await downloadBinary(outputUrl);
  return {
    requestId,
    bytes: transparent.bytes,
    contentType: transparent.contentType || "image/png",
  };
}
