import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";

export function loadPrompt(imageType: string): string {
  const safeName = path.basename(imageType);
  const promptPath = path.join(config.promptsDir, `${safeName}.txt`);

  if (!fs.existsSync(promptPath)) {
    throw new Error(`Missing prompt file for image type "${imageType}": ${promptPath}`);
  }

  return fs.readFileSync(promptPath, "utf8").trim();
}

export function renderPrompt(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{\s*([A-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
    return variables[key] ?? "";
  });
}
