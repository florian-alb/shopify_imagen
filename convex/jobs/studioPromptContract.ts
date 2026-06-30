import type { PromptKind } from "../promptRuntime";

type StudioPromptContractInput = {
  imageType: string;
  promptKind: PromptKind;
  prompt: string;
};

function normalized(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isStudioProductKind(promptKind: PromptKind) {
  return promptKind === "product_only" || promptKind === "product_detail";
}

function studioContractFor(imageType: string, promptKind: PromptKind) {
  if (!isStudioProductKind(promptKind)) return null;

  const name = normalized(imageType);
  const common = [
    "CRITICAL FINAL STUDIO CONTRACT:",
    "The output must be one clean final catalog photograph, not a collage, composite, reflection, overlay, or reference preview.",
    "Every shoe visible in the final image must be fully opaque, sharp, physically grounded, and part of the requested product arrangement.",
    "Do not place any faded, blurred, semi-transparent, duplicated, cropped, or background shoe copy anywhere in the frame.",
    "The area above the requested shoe arrangement must remain clean seamless white studio background.",
  ];

  if (name.includes("side profile") || name.includes("vue profil")) {
    return [
      ...common,
      "Mandatory count: exactly one complete shoe total in the whole image.",
      "Mandatory orientation: right-facing side profile only, toe on the right side of the image and heel on the left side.",
      "The outsole must be horizontal with one short contact shadow directly under the shoe.",
    ];
  }

  if (
    name.includes("front 3/4") ||
    name.includes("front 3-4") ||
    name.includes("3/4 avant")
  ) {
    return [
      ...common,
      "Mandatory count: exactly two complete shoes total in the whole image, forming one correct left and right pair.",
      "Mandatory orientation: both shoes face right, with both toes pointing to the right side of the image and heels to the left.",
      "Both shoes must sit on the same studio ground plane, fully opaque and sharp; the rear shoe must not be faded, blurred, lifted, floating, or ghosted.",
      "No shoe, shoe part, reflection, duplicate, or blurred silhouette may appear above or behind the two-shoe pair.",
    ];
  }

  if (
    name.includes("detail close") ||
    name.includes("close-up") ||
    name.includes("closeup")
  ) {
    return [
      ...common,
      "Mandatory count: exactly one physical shoe detail crop total in the whole image.",
      "No second shoe, background shoe, cropped duplicate, floating fragment, reflection, or ghosted product part may appear.",
      "The detail must stay recognizable as one shoe detail with crisp material, stitching, seam, hardware, or sole-edge structure.",
    ];
  }

  return null;
}

function removeConflictingStudioOrientation(
  prompt: string,
  imageType: string,
  promptKind: PromptKind,
) {
  if (!isStudioProductKind(promptKind)) return prompt;

  const name = normalized(imageType);
  if (name.includes("side profile") || name.includes("vue profil")) {
    return prompt
      .split("\n")
      .filter((line) => {
        const text = normalized(line);
        return !(
          text.includes("left-facing") ||
          text.includes("toe is on left") ||
          text.includes("toe on the left") ||
          text.includes("heel is on right") ||
          text.includes("heel on the right")
        );
      })
      .join("\n");
  }

  if (
    name.includes("front 3/4") ||
    name.includes("front 3-4") ||
    name.includes("3/4 avant")
  ) {
    return prompt
      .split("\n")
      .filter((line) => {
        const text = normalized(line);
        return !(
          text.includes("lower-left") ||
          text.includes("front-left") ||
          text.includes("upper-right") ||
          text.includes("back-right")
        );
      })
      .join("\n");
  }

  return prompt;
}

export function applyStudioPromptContract({
  imageType,
  promptKind,
  prompt,
}: StudioPromptContractInput) {
  const contract = studioContractFor(imageType, promptKind);
  if (!contract) return prompt;
  const sanitizedPrompt = removeConflictingStudioOrientation(
    prompt,
    imageType,
    promptKind,
  );
  return `${sanitizedPrompt.trim()}\n\n${contract.join("\n")}`;
}

export function referenceImageCountForStudio(args: {
  imageType: string;
  promptKind: PromptKind;
  requestedCount: number;
}) {
  const name = normalized(args.imageType);
  if (
    args.promptKind === "product_only" &&
    (name.includes("front 3/4") ||
      name.includes("front 3-4") ||
      name.includes("3/4 avant"))
  ) {
    return Math.max(args.requestedCount, 2);
  }
  return args.requestedCount;
}
