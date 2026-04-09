export function formatScore(value: number): string {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2);
}