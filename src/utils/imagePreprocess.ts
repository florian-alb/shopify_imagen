import sharp from "sharp";

export async function normalizeReferenceImage(inputPath: string, outputPath: string): Promise<string> {
  await sharp(inputPath)
    .rotate()
    .resize({
      width: 1024,
      height: 1024,
      fit: "inside",
      withoutEnlargement: true
    })
    .flatten({ background: "#ffffff" })
    .jpeg({
      quality: 92,
      mozjpeg: true
    })
    .toColorspace("srgb")
    .toFile(outputPath);

  return outputPath;
}
