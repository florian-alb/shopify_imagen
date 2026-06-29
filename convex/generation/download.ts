"use node";

export async function downloadBinary(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed (${response.status}) for ${url}.`);
  const contentType =
    response.headers.get("content-type")?.split(";")[0]?.trim() ||
    "application/octet-stream";
  return {
    bytes: Buffer.from(await response.arrayBuffer()),
    contentType,
  };
}
