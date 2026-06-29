"use node";

import type { Doc } from "../_generated/dataModel";

export function concatBytes(left: Uint8Array, right: Uint8Array) {
  const merged = new Uint8Array(left.length + right.length);
  merged.set(left);
  merged.set(right, left.length);
  return merged;
}

export async function consumeJsonLines(
  response: Response,
  startOffset: number,
  onLine: (line: string) => Promise<boolean>,
  onOffset: (offset: number) => Promise<void>,
) {
  if (!response.body)
    throw new Error("Gemini result file returned no response body.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffered = new Uint8Array();
  let offset = startOffset;
  while (true) {
    const { done, value } = await reader.read();
    if (value) buffered = concatBytes(buffered, value);
    let newline = buffered.indexOf(10);
    while (newline >= 0) {
      const line = decoder.decode(buffered.slice(0, newline)).trim();
      buffered = buffered.slice(newline + 1);
      offset += newline + 1;
      if (line && !(await onLine(line))) {
        await onOffset(offset);
        await reader.cancel();
        return false;
      }
      await onOffset(offset);
      newline = buffered.indexOf(10);
    }
    if (done) break;
  }
  const tail = decoder.decode(buffered).trim();
  if (tail && !(await onLine(tail))) {
    await onOffset(offset + buffered.length);
    return false;
  }
  if (buffered.length) await onOffset(offset + buffered.length);
  return true;
}

export async function consumeFirstInlineResponseArray(
  response: Response,
  onItem: (item: unknown) => Promise<boolean>,
) {
  if (!response.body)
    throw new Error("Gemini inline batch returned no response body.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const marker = /"inlinedResponses"\s*:\s*\[/;
  let search = "";
  let foundArray = false;
  let itemParts: string[] = [];
  let depth = 0;
  let inString = false;
  let escaped = false;
  let stopped = false;

  const consume = async (text: string) => {
    let segmentStart = depth > 0 ? 0 : -1;
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      if (depth === 0) {
        if (char === "]") return true;
        if (char !== "{") continue;
        depth = 1;
        segmentStart = index;
        continue;
      }
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') inString = false;
      } else if (char === '"') {
        inString = true;
      } else if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          itemParts.push(text.slice(segmentStart, index + 1));
          if (!(await onItem(JSON.parse(itemParts.join(""))))) {
            stopped = true;
            return true;
          }
          itemParts = [];
          segmentStart = -1;
        }
      }
    }
    if (depth > 0) itemParts.push(text.slice(segmentStart));
    return false;
  };

  while (true) {
    const { done, value } = await reader.read();
    const text = decoder.decode(value, { stream: !done });
    if (!foundArray) {
      search += text;
      const match = marker.exec(search);
      if (match) {
        foundArray = true;
        const complete = await consume(
          search.slice(match.index + match[0].length),
        );
        search = "";
        if (complete) {
          await reader.cancel();
          return !stopped;
        }
      } else {
        search = search.slice(-64);
      }
    } else if (await consume(text)) {
      await reader.cancel();
      return !stopped;
    }
    if (done) break;
  }
  if (!foundArray)
    throw new Error("Gemini legacy inline batch response array was not found.");
  return true;
}

export function geminiIngestChunkSize(pending: Doc<"generatedImages">[]) {
  const override = Number(process.env.GEMINI_INGEST_CHUNK_SIZE);
  if (Number.isFinite(override) && override > 0) return Math.floor(override);
  return pending.some((image) => image.removeBackground) ? 2 : 6;
}
