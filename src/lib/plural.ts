/**
 * "1 man", "2 men": a count with the word that goes with it, so a screen
 * never says "1 men" or "1 matches". Thousands get separators ("1,250
 * members"). No imports: pages use it in the browser.
 */
export function countOf(n: number, one: string, many: string): string {
  return `${n.toLocaleString('en-AU')} ${n === 1 ? one : many}`;
}
