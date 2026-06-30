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

// Turns any text into clean, URL/filename-safe slug.
export function slugify(value: string): string {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildSeoImageFilename(opts: {
  title: string;
  imageType: string;
  extension: string;
}): string {
  const slug =
    slugify(`${opts.title} ${opts.imageType}`).slice(0, 100).replace(/-+$/g, "") ||
    "produit";
  return `${slug}.${opts.extension}`;
}

export function compilePrompt(
  masterPrompt: string | null | undefined,
  templatePrompt: string,
): string {
  const master = String(masterPrompt ?? "").trim();
  const template = templatePrompt.trim();
  if (!master) return template;
  if (!template) return master;
  if (template.startsWith(master)) return template;
  return `${master}\n\n${template}`;
}

export function renderPrompt(
  template: string,
  variables: Record<string, string>,
): string {
  return template.replace(
    /\{\{\s*([A-Z0-9_]+)\s*\}\}/g,
    (_match, key: string) => variables[key] ?? "",
  );
}
