export function formatUsd(value: number) {
  return `$${value.toFixed(value < 1 ? 4 : 2)}`;
}
