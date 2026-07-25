export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function parseControlNumber(value: string) {
  const parsed = Number.parseInt(value.replace(/[^\d]/g, ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeHexInput(value: string) {
  const trimmed = value.trim();
  const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  return withHash.toUpperCase();
}

export function isValidHexColor(value: string) {
  return /^#[0-9A-F]{6}$/.test(value);
}

export function isEditableShortcutTarget(target: EventTarget | null) {
  const element = target instanceof HTMLElement ? target : null;
  return Boolean(
    element?.closest("input, textarea, select, [contenteditable='true']"),
  );
}
