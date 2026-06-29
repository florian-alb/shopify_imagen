import type { TokenUsage } from "../pricing";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function geminiUsage(meta: any): TokenUsage {
  return {
    inputTokens: meta?.promptTokenCount ?? 0,
    outputTokens: meta?.candidatesTokenCount ?? 0,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function openAiUsage(usage: any): TokenUsage {
  return {
    inputTokens: usage?.input_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? 0,
    inputTextTokens: usage?.input_tokens_details?.text_tokens,
    inputImageTokens: usage?.input_tokens_details?.image_tokens,
  };
}

export const OUTPUT_FORMAT_TO_MIME: Record<
  string,
  { contentType: string; extension: string }
> = {
  jpeg: { contentType: "image/jpeg", extension: "jpg" },
  jpg: { contentType: "image/jpeg", extension: "jpg" },
  png: { contentType: "image/png", extension: "png" },
  webp: { contentType: "image/webp", extension: "webp" },
};

export function mimeToExtension(contentType: string) {
  return (
    OUTPUT_FORMAT_TO_MIME[contentType.replace(/^image\//, "").toLowerCase()]
      ?.extension ?? "png"
  );
}
