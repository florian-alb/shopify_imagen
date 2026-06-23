export function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/œ/g, "oe")
    .replace(/Œ/g, "oe")
    .toLowerCase()
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Turns any text into a clean, URL/filename-safe slug (lowercase, no accents,
// dash-separated). Reuses normalizeText for accent/space normalization.
export function slugify(value: string): string {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Builds an SEO-friendly stored filename from the product title and image type,
// e.g. "voilage-lin-beige-situation.webp". The image type is the prompt
// template key it was generated from.
export function buildSeoImageFilename(opts: { title: string; imageType: string; extension: string }): string {
  const slug = slugify(`${opts.title} ${opts.imageType}`).slice(0, 100).replace(/-+$/g, "") || "produit";
  return `${slug}.${opts.extension}`;
}

export function compilePrompt(masterPrompt: string | null | undefined, templatePrompt: string): string {
  const master = String(masterPrompt ?? "").trim();
  const template = templatePrompt.trim();
  if (!master) return template;
  if (!template) return master;
  if (template.startsWith(master)) return template;
  return `${master}\n\n${template}`;
}

export function renderPrompt(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{\s*([A-Z0-9_]+)\s*\}\}/g, (_match, key: string) => variables[key] ?? "");
}

// Appends runtime directives to a rendered prompt: how to use a second
// reference image, and the scene context inferred from the vibe analysis.
export function augmentPrompt(
  basePrompt: string,
  opts: { vibe?: string | null; hasSecondReference?: boolean }
): string {
  const additions: string[] = [];
  if (opts.hasSecondReference) {
    additions.push(
      "Reference images: the FIRST image is the exact product to reproduce faithfully; the SECOND image is a styling/ambiance reference for the surrounding scene only — never copy its product."
    );
  }
  const vibe = opts.vibe?.trim();
  if (vibe) {
    additions.push(
      `Scene context to honour — match this setting, audience and mood, and override any generic interior described above: ${vibe}`
    );
  }
  return additions.length ? `${basePrompt}\n\n${additions.join("\n\n")}` : basePrompt;
}
